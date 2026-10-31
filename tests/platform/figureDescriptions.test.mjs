/*
 * STUDENT PASS 3, Q-8 (VPAT 1.1.1): FIGURES OUTSIDE THE SHARED PLANE SAY WHAT
 * THEY SHOW.
 *
 * The interval number line, the legacy pick-a-point line, the three-plane
 * model, the static question graph, the legacy graph workspace and the Graph
 * Story sketch were named by their operating instructions ("Click anywhere on
 * the line…", "Drag or use the arrow keys to rotate") or a bare "Question
 * graph", and nothing said what was drawn. The words come from pure modules,
 * tested here; tests/browser/figureDescriptions.mjs reads them from the
 * accessibility tree at 1366x768 and 390x844 and changes each figure once.
 *
 * The rule each module keeps: the student's own drawing is read back exactly;
 * nothing that answers the question is said while it can be answered — no
 * notation for a line whose notation is asked, no classification of a system
 * of planes, no positions on a given graph.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { describeNumberLine, describeNumberLinePiece, describePointChoiceLine, numberLineValueText } from '../../src/platform/language/numberLineDescription.js';
import { describeThreePlaneModel } from '../../src/tools/systemsWorkspace/threePlaneDescription.js';
import { describeGraphWorkspace } from '../../src/platform/language/graphWorkspaceDescription.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const INF = Number.POSITIVE_INFINITY;
const NOTATION = /[[\]()]|[≤≥<>]|\bx\s*=/;

test('a number line reads its dots, their ends and the shading, never notation', () => {
  assert.equal(numberLineValueText(-13 / 8), '−13/8');
  assert.equal(numberLineValueText(-0), '0');
  assert.equal(describeNumberLinePiece({ min: -3, max: 5, minClosed: true, maxClosed: false }), 'Shaded from a closed dot at −3 to an open dot at 5.');
  assert.equal(describeNumberLinePiece({ min: 2, max: INF, minClosed: false, maxClosed: false }), 'Shaded from an open dot at 2 to the right, ending in an arrow.');
  assert.equal(describeNumberLinePiece({ min: -INF, max: 1 / 2, minClosed: false, maxClosed: true }), 'Shaded from a closed dot at 1/2 to the left, ending in an arrow.');
  assert.equal(describeNumberLinePiece({ min: -INF, max: INF }), 'The whole line is shaded, with an arrow at each end.');
  assert.equal(describeNumberLinePiece({ min: 4, max: 4, minClosed: true, maxClosed: true }), 'A closed dot at 4, with no shading.');

  // The window as its ticks print it; the student's endpoints exactly.
  assert.equal(describeNumberLine({ min: -7.5, max: 10, labelStep: 5 }), 'Number line from −7.5 to 10, labelled every 5. Nothing is drawn on it yet.');
  const two = describeNumberLine({
    min: -10, max: 10, labelStep: 2,
    pieces: [{ min: -INF, max: -2, maxClosed: false }, { min: 3, max: INF, minClosed: true }],
    pending: { value: 7, closed: false },
  });
  assert.equal(two, 'Number line from −10 to 10, labelled every 2. Your graph has 2 parts. Part 1: Shaded from an open dot at −2 to the left, ending in an arrow. Part 2: Shaded from a closed dot at 3 to the right, ending in an arrow. An open dot at 7 is placed and waits for a second endpoint or a ray.');
  for (const text of [two, describeNumberLine({ min: -8, max: 8, pieces: [{ min: -13 / 8, max: 13 / 8, minClosed: true, maxClosed: false }] })]) {
    assert.doesNotMatch(text.replace(/^Number line from [^.]+\.\d*[^.]*\./, ''), NOTATION, `no interval notation or inequality: ${text}`);
  }
  assert.match(describeNumberLine({ min: 0, max: 4, owner: 'given' }), /Nothing is drawn on it\.$/);
});

test('the pick-a-point line names its marks and the chosen one', () => {
  assert.equal(describePointChoiceLine({ choices: [-10, -5, 0, 5, 10] }), 'Number line with points at −10, −5, 0, 5 and 10. No point is selected yet.');
  assert.equal(describePointChoiceLine({ choices: [-10, 0], selected: -10 }), 'Number line with points at −10 and 0. Selected: −10.');
});

test('the three-plane model: planes by equation; no classification while it can be answered', () => {
  const equations = ['x + y + z = 6', '2x - y + z = 3', '-x + 2y + z = 5'];
  const open = describeThreePlaneModel({ equations, visible: [true, false, true], crossings: [[0, 2]] });
  assert.equal(open, '3D model with the x, y and z axes. Plane 1, blue: x plus y plus z equals 6. Plane 2, red: 2x minus y plus z equals 3, hidden. Plane 3, green: negative x plus 2y plus z equals 5. Dashed lines mark where shown planes cross.');
  // Fails closed: with no detail given it names no pair, whatever the crossings.
  for (const crossings of [[[0, 1]], [[0, 1], [1, 2]], [[0, 1], [0, 2], [1, 2]]]) {
    const text = describeThreePlaneModel({ equations, crossings });
    assert.doesNotMatch(text, /planes \d and \d|parallel|meet at|one point|no point|infinitely|Marked/i, text);
    assert.match(text, /Dashed lines mark where shown planes cross\.$/);
  }
  // A closed question names each shown pair, and a marked point is read.
  const closed = describeThreePlaneModel({ equations, crossings: [[0, 1], [1, 2]], detail: 'features', markedPoint: '(1, −2, 4)' });
  assert.match(closed, /A dashed line marks where planes 1 and 2 cross\. Planes 1 and 3 have no dashed line between them\. A dashed line marks where planes 2 and 3 cross\. Marked on the model: the point 1, negative 2, 4\.$/);
  assert.match(describeThreePlaneModel({ equations, visible: [false, false, false] }), /No plane is shown\.$/);
});

test('the legacy graph workspace reads back the student\'s work, and a given graph only as drawn', () => {
  const window = { xMin: -4, xMax: 4, yMin: -6, yMax: 8 };
  assert.equal(describeGraphWorkspace({ window }), 'x from −4 to 4, y from −6 to 8. Nothing is placed yet.');
  const work = describeGraphWorkspace({
    window,
    placedPoints: [{ label: 'Plot the point where x = 0', point: [0, 1] }, { label: '', point: [2, -5] }],
    strokeCount: 2,
    markers: [{ type: 'arrow', point: [3, 7] }, { type: 'open', point: [-2, -3] }, null],
    selectedPoints: [[1, 3]],
  });
  assert.equal(work, 'x from −4 to 4, y from −6 to 8. You placed 2 points: Plot the point where x = 0 at (0, 1); (2, −5). You drew 2 strokes. Graph ends you marked: an arrow at (3, 7); an open dot at (−2, −3). You selected 1 point: (1, 3).');
  assert.match(describeGraphWorkspace({ window, curveDrawn: true, strokeCount: 3 }), /Your curve is drawn through your points\.$/);
  const given = describeGraphWorkspace({ window, givenGraph: true });
  assert.equal(given, 'x from −4 to 4, y from −6 to 8. A graph is drawn. Positions on it are not read out while this question can be answered.');
});

/*
 * Wiring. Each figure is NAMED by what it is and DESCRIBED by the generated
 * text (then, for a control, its keys), the description follows the live
 * state, and the activity rule comes from the platform, not the figure.
 */
test('the interval number line is described by the student\'s drawing, then its keys', () => {
  const source = executableSource(read('src/tools/intervalNumberLine/IntervalNumberLine.jsx'));
  assert.match(source, /^import \{[^}]*\bnumberLineReading\b[^}]*\} from '\.\.\/\.\.\/platform\/language\/numberLineDescription\.js';$/m);
  // The generator's English is the description (its messages, `say`, are
  // Read aloud's in another language: AX05, figureReadingSpanish.test.mjs).
  assert.match(source, /const \{ text: lineDescription, say: lineSay \} = numberLineReading\(\{ min, max, labelStep: majorStep, pieces: drawn, pending \}\);/, 'from the drawn pieces and the waiting endpoint');
  const svg = region(source, '<svg\n            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}\n            role="application"', 'onFocus={handleLineFocus}', 'the line');
  assert.match(svg, /aria-label=\{`Number line from \$\{lineEndLabel\(min\)\} to \$\{lineEndLabel\(max\)\}`\}/, 'named by the line, not its instructions');
  assert.match(svg, /aria-describedby=\{`\$\{lineDescriptionId\} \$\{lineInstructionsId\}`\}/, 'what is drawn first, then the keys');
  assert.match(source, /<p id=\{lineDescriptionId\}[^>]*>\{lineDescription\}<\/p>/);
  assert.match(source, /<p id=\{lineInstructionsId\}[^>]*>\s*\{`Click anywhere on the line/);
});

test('the legacy pick-a-point line is a described group with pressed marks', () => {
  const source = executableSource(read('src/NumberLine.jsx'));
  assert.match(source, /^import \{ pointChoiceLineReading \} from '\.\/platform\/language\/numberLineDescription\.js';$/m);
  assert.match(source, /const \{ text: description, say: descriptionSay \} = pointChoiceLineReading\(\{ choices, selected: selectedPoint \}\);/);
  assert.match(source, /role="group" aria-label="Number line" aria-describedby=\{descriptionId\}/);
  assert.match(source, /aria-pressed=\{selectedPoint === Number\(number\)\}/);
  assert.match(source, /<span id=\{descriptionId\}[^>]*>\{description\}<\/span>/);
});

test('the three-plane model is described by its planes; the detail follows the question\'s lifecycle', () => {
  const source = executableSource(read('src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx'));
  assert.match(source, /^import \{ describeThreePlaneModel \} from '\.\/threePlaneDescription\.js';$/m);
  assert.match(source, /^import \{ useQuestionLifecycle \} from '\.\.\/\.\.\/platform\/question\/QuestionLifecycleContext\.jsx';$/m);
  const description = region(source, 'const modelDescription = useMemo(() => describeThreePlaneModel({', '}), [', 'the description');
  assert.match(description, /visible: visiblePlanes,/, 'follows Show plane');
  assert.match(description, /crossings: intersectionLines\.map/, 'the dashed lines actually drawn');
  assert.match(description, /detail: questionClosed \? 'features' : 'kinds',/, 'pairs only once the question is closed');
  assert.match(description, /markedPoint: solutionMarker \? orderedTripleText\(shownSolution, variables\) : null,/, 'a point only where the model marks one (the reveal policy)');
});

test('the static question graph carries the shared plane\'s description, by the same rule', () => {
  const source = executableSource(read('src/GraphDisplay.jsx'));
  // (The import list also names joinSegmentPaths, AX27: what is asserted is that the description is the shared one.)
  assert.match(source, /^import \{[^}]*\bdescribeCoordinatePlane\b[^}]*\} from '\.\/platform\/language\/graphDescription\.js';$/m);
  assert.match(source, /^import \{ useQuestionLifecycle \} from '\.\/platform\/question\/QuestionLifecycleContext\.jsx';$/m);
  // Kinds while open, features once closed; authored text wins. For a student
  // whose plan gives the graph read-out (AX03), features while open too, after
  // any authored text (behaviour: tests/platform/graphReadOut.test.mjs).
  assert.match(source, /const reading = \(detail\) => describeStaticGraph\(\{[\s\S]*?asymptotes: graphAsymptoteLines\(graph\), detail,/);
  // `reading` returns the whole description ({ description, say }: AX05's
  // messages travel with it to Read aloud).
  assert.match(source, /const generated = authoredDescription \? null : reading\(questionClosed \|\| readOut \? 'features' : 'kinds'\);/, 'kinds while open, features once closed');
  assert.match(source, /const spokenDescription = authoredDescription\s*\? \[authoredDescription, readOut \? reading\('features'\)\.description : ''\]\.filter\(Boolean\)\.join\(' '\)\s*: generated\.description;/, 'authored text wins');
  const svg = region(source, '<svg\n        className="mathmaster-responsive-canvas"', '>', 'the graph svg');
  assert.match(svg, /aria-describedby=\{descriptionId\}/);
  assert.match(source, /<p id=\{descriptionId\}[^>]*>\{spokenDescription\}<\/p>/);
  // Hooks before the early return (rules of hooks).
  const head = region(source, 'export default function GraphDisplay(', 'if (!graph) return null;', 'the component head');
  assert.match(head, /useId\(\)[\s\S]*useQuestionLifecycle\(\)/);
  assert.match(head, /useGraphReadOut\(\)[\s\S]*useReportGraphReadOut\(/);
});

test('the legacy graph workspace and the Graph Story sketch are described by the student\'s work', () => {
  const workspace = executableSource(read('src/InteractiveGraphWorkspace.jsx'));
  assert.match(workspace, /^import \{ describeGraphWorkspace \} from '\.\/platform\/language\/graphWorkspaceDescription\.js';$/m);
  const call = region(workspace, 'const workspaceDescription = describeGraphWorkspace({', '\n  });', 'the description');
  assert.match(call, /construction\.placements\[task\.id\]/, 'the points the student placed');
  assert.match(call, /givenGraph: mode === 'analysis' && !pointOnly,/);
  assert.match(workspace, /aria-label="Coordinate plane"\s*aria-describedby=\{`\$\{workspaceDescriptionId\} \$\{workspaceDescriptionId\}-keys`\}/);
  assert.match(workspace, /<span id=\{workspaceDescriptionId\}[^>]*>\{workspaceDescription\}<\/span>/);
  const story = executableSource(read('src/GraphStory.jsx'));
  assert.match(story, /const strokeCount = Array\.isArray\(values\.strokes\) \? values\.strokes\.length : 0;/);
  // Since AX14 the sketch takes keys (role="application"); its description is
  // what is drawn, then the keyboard route (graphStorySketchKeys.test.mjs).
  assert.match(story, /role=\{keyboardRoute \? 'application' : 'img'\}\s*aria-label="Graph story sketch"\s*aria-describedby=\{keyboardRoute \? `\$\{sketchDescriptionId\} \$\{sketchDescriptionId\}-keys` : sketchDescriptionId\}/);
  assert.match(story, /<span id=\{sketchDescriptionId\}[^>]*>\{sketchDescription\}<\/span>/);
});

test('the statistics charts are named for what they are', () => {
  const lab = executableSource(read('src/tools/dataModeling/DataModelingLab.jsx'));
  assert.match(region(lab, 'function ResidualPlot(', '\n}', 'the residual plot'), /ariaLabel="Residual plot"/);
  assert.match(region(lab, "<Panel title={`${panelNumbers.model} · Scatter plot and your model`}>", '/>', 'the scatter plot'), /ariaLabel="Scatter plot of the data and your model"/);
  const regression = executableSource(read('src/tools/regressionCalculator/RegressionCalculator.jsx'));
  assert.match(regression, /ariaLabel="Source scatterplot"/);
});

/*
 * W5-2 REVIEW (B1, S1, S2): the real GraphDisplay, server-rendered.
 *
 *   B1  An axis-scale item hides its tick numbers until the student gives the
 *       step (graph.axisDisplay; AxisSetupStage requireScale, RelationshipModel
 *       hideGraphScale). The description said "x from 0 to 50, y from 0 to 200",
 *       and with the gridlines that is the step the item grades. It now says
 *       neither range, and reads no position even once closed.
 *   S1  Positions are read only where the outcome is shown and the question is
 *       finished (`positionsReadable`), never from a lock alone: an ended DOL,
 *       a waiting Warm-Up and a locked section are `terminal` but show nothing.
 *   S2  An arrowhead says which way it points (it always said "right").
 */
const withGraphDisplay = async (run) => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: GraphDisplay } = await server.ssrLoadModule('/src/GraphDisplay.jsx');
    const { QuestionLifecycleProvider } = await server.ssrLoadModule('/src/platform/question/QuestionLifecycleContext.jsx');
    const { default: React } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const describe = (graph, lifecycle = null) => {
      const figure = React.createElement(GraphDisplay, { graph, enlargeable: false });
      const html = renderToStaticMarkup(lifecycle ? React.createElement(QuestionLifecycleProvider, lifecycle, figure) : figure);
      const text = html.match(/<p id="[^"]*" data-graph-description=""[^>]*>([^<]*)<\/p>/);
      assert.ok(text, 'the graph has its description paragraph');
      return text[1].replace(/&#x27;/g, "'");
    };
    return await run(describe);
  } finally {
    await server.close();
  }
};

test('B1: an axis that hides its numbers is not read, open or closed', async () => {
  await withGraphDisplay((describe) => {
    const scale = {
      xMin: 0, xMax: 50, yMin: 0, yMax: 200, xStep: 5, yStep: 20,
      points: [{ x: 10, y: 40 }, { x: 30, y: 120 }],
      axisDisplay: { showXTickLabels: false, showYTickLabels: false },
    };
    for (const lifecycle of [null, { terminal: true }, { terminal: true, positionsReadable: true }]) {
      const text = describe(scale, lifecycle);
      assert.match(text, /^The axis numbers are not shown\. /, text);
      assert.doesNotMatch(text, /\b(50|200|20|5|10|30|40|120)\b/, `no window end, step or position: ${text}`);
      assert.match(text, /Positions are not read out/, 'kinds only, closed question or not');
    }
    // One hidden axis: the other keeps its range; still no positions.
    const yOnly = describe({ ...scale, axisDisplay: { showYTickLabels: false } }, { terminal: true, positionsReadable: true });
    assert.match(yOnly, /^x from 0 to 50\. The y-axis numbers are not shown\./, yOnly);
    assert.doesNotMatch(yOnly, /\b200\b|\(10, 40\)/);
    // Numbers shown: the full window, as before.
    assert.match(describe({ ...scale, axisDisplay: {} }), /^x from 0 to 50, y from 0 to 200\./);
  });
});

test('S1: a locked question reads kinds; a finished one with its outcome shown reads positions', async () => {
  await withGraphDisplay((describe) => {
    const graph = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, points: [{ x: 2, y: 3, label: 'A' }] };
    // Ended DOL, waiting Warm-Up, locked section, a DOL item before release:
    // terminal, no review shown. Kinds, said as true of a closed question.
    const locked = describe(graph, { terminal: true });
    assert.match(locked, /Positions are not read out on this question\./, locked);
    assert.doesNotMatch(locked, /while this question can be answered/);
    assert.doesNotMatch(locked, /\(2, 3\)/);
    // Open: still "while this question can be answered".
    assert.match(describe(graph), /Positions are not read out while this question can be answered\./);
    // Correct practice (or a released review): the full reading.
    const finished = describe(graph, { terminal: true, positionsReadable: true });
    assert.match(finished, /A at \(2, 3\)/, finished);
    // Only an explicit true opens it.
    assert.doesNotMatch(describe(graph, { terminal: true, positionsReadable: 'yes' }), /\(2, 3\)/);
  });
  // S1': QuestionEngine reads positions exactly when the worked solution is
  // shown — the closedReview gate — never from a lock, and never from
  // showOutcomeFeedback alone (on a DOL that is true as soon as the item
  // closes, before the assignment's release; a teacher's extra try reopens it).
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /<QuestionLifecycleProvider terminal=\{locked\} positionsReadable=\{positionsReadable\}>/);
  assert.match(engine, /^  const positionsReadable = Boolean\(\(isCorrect \|\| isExpired\) && feedbackOpen\);$/m);
  assert.match(engine, /const closedReview = \(isCorrect \|\| isExpired\) && feedbackOpen \?/, 'the same gate as the worked solution');
  // feedbackOpen on a closed DOL item: shut until the assignment is released.
  const { feedbackOpenForItem } = await import('../../src/platform/supports/feedback/attemptFeedbackPlan.js');
  const dolItem = { showOutcomeFeedback: true, immediateFeedback: false, closed: true, roleKnown: true };
  assert.equal(feedbackOpenForItem({ ...dolItem, assessmentReleased: false }), false, 'a closed DOL item before release reads no positions');
  assert.equal(feedbackOpenForItem({ ...dolItem, assessmentReleased: true }), true, 'after release it does');
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: true, closed: true, roleKnown: true }), true, 'correct practice does');
  // Every figure that reads positions reads this flag, not `terminal`.
  for (const file of ['src/GraphDisplay.jsx', 'src/tools/shared/CoordinatePlane.jsx', 'src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx']) {
    assert.match(executableSource(read(file)), /const \{ positionsReadable: questionClosed(?:, terminal: questionLocked)? \} = useQuestionLifecycle\(\);/, file);
  }
});

test('S2: each arrowhead on a closed static graph says which way it points', async () => {
  await withGraphDisplay((describe) => {
    const text = describe({
      xMin: -5, xMax: 5, yMin: -5, yMax: 5,
      endpointRequirements: [
        { point: [-4, -4], marker: 'arrow', vector: [-1, -1] },
        { point: [4, 4], marker: 'arrow', vector: [1, 1] },
      ],
    }, { terminal: true, positionsReadable: true });
    assert.match(text, /pointing down and left/, text);
    assert.match(text, /pointing up and right/, text);
    // A tiny vector (an edge arrow found by bisection, W5-5) still points.
    const tiny = describe({
      xMin: -5, xMax: 5, yMin: -5, yMax: 5,
      endpointRequirements: [{ point: [-4, -4], marker: 'arrow', vector: [-4.6e-14, -1.8e-13] }],
    }, { terminal: true, positionsReadable: true });
    assert.match(tiny, /pointing down/, tiny);
    assert.doesNotMatch(tiny, /pointing right/);
  });
});

test('a fitted window that ends between ticks is read at tick precision', async () => {
  await withGraphDisplay((describe) => {
    // An equal-unit window computed to fit (W5-5) ends at ±6.374046.
    const text = describe({ xMin: -10, xMax: 10, yMin: -6.374046, yMax: 6.374046, xStep: 2, yStep: 2, points: [] });
    assert.match(text, /^x from −10 to 10, y from about −6\.4 to about 6\.4\./, text);
    assert.doesNotMatch(text, /6\.374/);
    // A window end already at the step's precision is said exactly, even off a labelled tick.
    assert.match(describe({ xMin: -5, xMax: 5, yMin: -5, yMax: 7, xStep: 2, yStep: 2, points: [] }), /^x from −5 to 5, y from −5 to 7\./);
    // So is an authored end one decimal finer than the step (AX36): 7.5 on a
    // step-1 axis was read "about 7.5".
    const authored = describe({ xMin: -2.5, xMax: 7.5, yMin: -5, yMax: 5, xStep: 1, yStep: 1, points: [] });
    assert.match(authored, /^x from −2\.5 to 7\.5, y from −5 to 5\./, authored);
  });
});

test('S4: Review My Work reads its released solution figures in full', () => {
  const review = executableSource(read('src/components/student/ReviewMyWork.jsx'));
  assert.match(review, /^import \{ QuestionLifecycleProvider \} from '\.\.\/\.\.\/platform\/question\/QuestionLifecycleContext\.jsx';$/m);
  assert.match(review, /<QuestionLifecycleProvider terminal positionsReadable>\s*<SolutionReviewPanel\b[\s\S]*?\/>\s*<\/QuestionLifecycleProvider>/, 'the solution panel only');
  // The practice below is live work (its keypad stays): outside the provider.
  assert.equal((review.match(/<QuestionLifecycleProvider\b/g) || []).length, 1);
  assert.ok(review.indexOf('<PracticeLikeThis') > review.indexOf('</QuestionLifecycleProvider>'), 'the practice below stays live');
});

test('only QuestionEngine marks a reference authoritative (N3)', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (dir) => readdirSync(new URL(`../../${dir}`, import.meta.url)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(new URL(`../../${path}`, import.meta.url)).isDirectory() ? walk(path) : [path];
  });
  const setters = walk('src').filter((file) => /\.(jsx?|mjs)$/.test(file))
    .filter((file) => executableSource(read(file)).split('\n').some((line) => /\breference:/.test(line) && /\bauthoritative:\s*true\b/.test(line)));
  assert.deepEqual(setters, ['src/QuestionEngine.jsx']);
});
