/*
 * EVERY KIND OF COORDINATE PLANE, WITH WHAT EACH DRAWS, ON ONE PAGE.
 *
 *   open http://127.0.0.1:5198/tests/browser/forcedColorsPlanes.html
 *   ?view=calculator   the graphing calculator alone: it opens as a panel over
 *                      the page, so it has a page of its own
 *
 * The forced-colours walk reads the planes the certified scenes and the Math
 * Tools Lab show (forcedColorsCertification.mjs). Those show the shared plane
 * (src/tools/shared/CoordinatePlane.jsx) in a tool, and none of the rest: the
 * graph workspace a function-graph question opens (InteractiveGraphWorkspace),
 * the static graph of a figure with its dashed and vertical lines and shaded
 * half-planes (GraphDisplay), Graph Story's sketch, the Live Challenge rounds'
 * graphs (a rush graph with its found and missed marks, Graph the Line's grid,
 * a revealed line) and the graphing calculator's board (JSXGraph). Each is here,
 * mounted with its real component and props, in the state a student sees it in:
 * points placed and a curve drawn, a region shaded, a mark found. Nothing is
 * restyled here: the page takes the app's stylesheets, and its theme from
 * <html data-theme>, as the app's pages do.
 *
 * Every drawing is in `[data-plane-gallery]`; the walk reads the planes in
 * them. All data is synthetic.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import CoordinatePlane from '../../src/tools/shared/CoordinatePlane.jsx';
import GraphDisplay from '../../src/GraphDisplay.jsx';
import FunctionGraphBuilder from '../../src/FunctionGraphBuilder.jsx';
import GraphAnalysis from '../../src/GraphAnalysis.jsx';
import GraphStory from '../../src/GraphStory.jsx';
import GraphFeatureRushGraph from '../../src/components/liveChallenge/GraphFeatureRushGraph.jsx';
import LineGraphCanvas from '../../src/components/liveChallenge/LineGraphCanvas.jsx';
import LineRevealGraph from '../../src/components/liveChallenge/LineRevealGraph.jsx';
import GraphingCalculatorPanel from '../../src/components/assessment/GraphingCalculatorPanel.jsx';
import { ARENA_LINE_VARS, ARENA_RUSH_VARS } from '../../src/components/liveChallenge/grandPrixTheme.js';
import { graphDrawing } from '../../src/platform/liveChallenge/rushGraphModel.js';
import { writeQuestionDraft } from '../../src/questionDraftStorage.js';
import { generateQuestionForSlot, publicRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { GRAPH_FEATURE, QUESTION_TIER } from '../../functions/shared/graphFeatureRegistry.mjs';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/ui/uiKit.css';

// ------------------------------------------------------------------ the shared plane
// Two curves (solid and dashed), a line, a broken line, a guide and two
// boundaries (solid, dashed), a horizontal guide, a labelled point, a given
// point (a square), open and closed end points, an arrow, two shaded regions
// that overlap, and the minor grid a readable plane draws between its labels.
const SHARED = {
  xMin: -10, xMax: 10, yMin: -10, yMax: 10, readableGrid: true,
  functions: [(x) => 0.1 * x * x - 6, (x) => -0.5 * x + 6],
  lines: [{ m: 1, b: -2 }],
  polylines: [{ points: [[-9, -3], [-7, 1], [-5, -1]] }],
  verticalLines: [7, { x: -2, boundaryStyle: 'solid' }, { x: 3, boundaryStyle: 'dashed' }],
  horizontalLines: [8],
  points: [
    { x: 2, y: 0, label: 'A' },
    { x: -4, y: 4, shape: 'square', label: 'B' },
    { x: 5, y: -4, marker: 'open' },
    { x: 8, y: -4, marker: 'closed' },
    { x: -8, y: 7, marker: 'arrow', vector: [1, 1] },
  ],
  regions: [
    { points: [[-10, -10], [10, -10], [10, -3], [-10, -3]] },
    { points: [[0, -10], [10, -10], [10, 10], [0, 10]] },
  ],
};

// ------------------------------------------------------------------ the static graph
// A line, a dashed boundary with its side shaded, a dashed vertical boundary
// and its side, a labelled point, an exponential with its asymptote, axis
// titles and the quadrant labels.
const STATIC = {
  xMin: -6, xMax: 6, yMin: -6, yMax: 6,
  functions: [
    { type: 'line', m: 0.5, b: 1 },
    { type: 'line', m: -1, b: 3, dashed: true },
    { type: 'exponential', a: 0.5, b: 1.5, h: 0, k: -3 },
  ],
  verticalLines: [{ x: -3, dashed: true }],
  points: [{ x: 2, y: 2, label: 'P' }],
  shading: [{ m: -1, b: 3, relation: '<' }],
  quadrantLabels: true,
  xAxisLabel: 'Time', xAxisUnit: 'h',
  yAxisLabel: 'Height', yAxisUnit: 'm',
};
// A system: two shaded half-planes, overlapping.
const SYSTEM = {
  xMin: -6, xMax: 6, yMin: -6, yMax: 6,
  functions: [{ type: 'line', m: 0.6, b: 1 }, { type: 'line', m: -0.6, b: 1, dashed: true }],
  shading: [{ m: 0.6, b: 1, relation: '<=' }, { m: -0.6, b: 1, relation: '<' }],
};
// The value a student is reading off a graph (a closed question's highlight).
const HIGHLIGHT = { ...STATIC, shading: [], interactionHighlight: { x: 2, y: 2, showPoint: true, label: 'f(2) = 2' } };

// ------------------------------------------------------------------ the graph workspace
// A line on a finite domain (a closed and an open end), plotted from two points
// the student placed, checked, and connected: the curve, the placed points, one
// end marked and the other still asking to be marked. Seeded as a reload finds
// the student's work.
const WORKSPACE_KEY = 'mm-planes-gallery:workspace';
const WORKSPACE = {
  questionId: 'planes-gallery-workspace',
  type: 'functionGraph',
  prompt: 'Graph y = x + 1 for −2 ≤ x < 3.',
  functionSpec: { type: 'linear', m: 1, b: 1, domain: { min: -2, max: 3, minInclusive: true, maxInclusive: false } },
  graph: { xMin: -4, xMax: 4, yMin: -4, yMax: 6 },
  pointTasks: [
    { id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
    { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 3] },
  ],
};
const ANALYSIS = {
  questionId: 'planes-gallery-analysis',
  type: 'graphAnalysis',
  prompt: 'Read the graph of y = 2x − 1.',
  functionSpec: { type: 'linear', m: 2, b: -1 },
  graph: { xMin: -4, xMax: 4, yMin: -6, yMax: 6 },
  analysisRequests: [{ id: 'at-two', kind: 'value', label: 'The value of $f(2)$', expected: 3 }],
};
const STORY_KEY = 'mm-planes-gallery:story';
const STORY = { questionId: 'planes-gallery-story', type: 'graphStory', prompt: 'Sketch a graph for a story.', requireSketch: true };

const seedDrafts = () => {
  writeQuestionDraft(`${WORKSPACE_KEY}:graph-stage`, 'construct', { edit: true });
  writeQuestionDraft(`${WORKSPACE_KEY}:graph-construction`, {
    placements: { p1: [0, 1], p2: [2, 3] }, chosenXValues: { p1: '0', p2: '2' }, pointsValidated: true,
    strokes: [], sketchView: null, snapped: true, markerPlacements: { 'endpoint-0-start': 'closed' },
  }, { edit: true });
  writeQuestionDraft(`${STORY_KEY}:graph-story`, {
    scenario: '', independent: '', dependent: '', xLabel: 'Minutes', xUnit: '', yLabel: 'Distance', yUnit: '', explanation: '',
    strokes: [
      [{ x: 60, y: 360 }, { x: 160, y: 300 }, { x: 260, y: 240 }, { x: 360, y: 240 }],
      [{ x: 420, y: 200 }],
      [{ x: 460, y: 180 }, { x: 560, y: 120 }, { x: 660, y: 90 }],
    ],
  }, { edit: true });
};

// ------------------------------------------------------------------ Live Challenge
// A round's graph is drawn on the Grand Prix's glass, its tokens set on the
// round's shell (GraphFeatureRushRound.jsx, LineGraphRound.jsx); here on a box
// of the shell's own class (without the round's stylesheet, which lays the
// shell over the whole screen), with the same tokens.
const tokens = (text) => Object.fromEntries(String(text).split(';').map((entry) => entry.trim()).filter(Boolean)
  .map((entry) => [entry.slice(0, entry.indexOf(':')).trim(), entry.slice(entry.indexOf(':') + 1).trim()]));
const RUSH_SHELL = { ...tokens(ARENA_RUSH_VARS), padding: 12, borderRadius: 12, background: '#0b1240', display: 'inline-block' };
const LINE_SHELL = { ...tokens(ARENA_LINE_VARS), '--mm-line-label-bg': 'var(--mm-graph-bg)', '--mm-line-label-text': 'var(--mm-graph-label)', padding: 12, borderRadius: 12, background: '#0b1240', display: 'inline-block' };

const rushQuestion = (family, feature, variant, tier, seedText) => publicRushQuestion(generateQuestionForSlot({ slot: { family, feature, variant, tier }, seedText }));
const RUSH_DOMAIN = rushQuestion('squareRoot', GRAPH_FEATURE.DOMAIN, 'endpoint', QUESTION_TIER.EASY, 'planes-gallery');
const RUSH_RANGE = rushQuestion('exponential', GRAPH_FEATURE.RANGE, 'asymptote', QUESTION_TIER.STANDARD, 'planes-gallery');
const RUSH_FOUND = (RUSH_DOMAIN?.targets || []).slice(0, 1).map((target) => target.id);
const RUSH_MISS = { kind: 'miss', questionIndex: RUSH_RANGE?.questionIndex, x: 1, y: 1, seq: 1 };

const LINE_VIEW = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
// x − 2y = −2 (y = x/2 + 1), given, with a marked point.
const GIVEN_LINE = { view: LINE_VIEW, line: { a: 1, b: -2, c: -2 }, marked: { x: 2, y: 2 } };
const REVEAL = {
  view: LINE_VIEW,
  line: { a: 1, b: -2, c: -2 },
  equation: { text: 'y = ½x + 1', speech: 'y equals one half x plus 1' },
  keyPoints: [{ x: 0, y: 1 }, { x: 2, y: 2 }],
  class: { answered: 6, correct: 3, mistake: { line: { a: 2, b: -1, c: -1 }, students: 2, text: 'y = 2x + 1', label: 'Slope and intercept swapped' } },
};

// ------------------------------------------------------------------ the page
// What a tool hands its host (the answer it would grade): nothing to do here.
const ignore = () => {};

const Gallery = ({ id, title, children, wide = false }) => (
  <section data-plane-gallery={id} aria-label={title} style={{ display: 'grid', gap: 8, minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
    <h2 style={{ margin: 0, fontSize: 'calc(16 * var(--mm-px))' }}>{title}</h2>
    {children}
  </section>
);

const VIEW = new URLSearchParams(window.location.search).get('view');

function Planes() {
  if (VIEW === 'calculator') {
    return (
      <main style={{ padding: 16, width: '100%', minWidth: 0, maxWidth: 1340, margin: '0 auto', boxSizing: 'border-box' }}>
        <Gallery id="calculator" title="The graphing calculator">
          <GraphingCalculatorPanel open showLauncher={false} keepLinesKey="mm-planes-gallery:lines" />
        </Gallery>
      </main>
    );
  }
  return (
    // The screen's width (the app's root lays its child out as a flex item, which would grow to the widest plane).
    <main style={{ padding: 16, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', width: '100%', minWidth: 0, maxWidth: 1340, margin: '0 auto', boxSizing: 'border-box' }}>
      <Gallery id="shared" title="The shared plane">
        <CoordinatePlane ariaLabel="The shared plane" describeFeatures enlargeable={false} {...SHARED} />
      </Gallery>
      <Gallery id="shared-plot" title="A plane a student plots on">
        <CoordinatePlane
          ariaLabel="A plane a student plots on" enlargeable={false} xMin={-6} xMax={6} yMin={-6} yMax={6}
          points={[{ x: 1, y: 2, label: 'P1' }, { x: 3, y: -1 }]} lines={[{ m: -1.5, b: 3.5 }]}
          onPlot={() => {}} onMovePoint={() => {}}
        />
      </Gallery>
      <Gallery id="static" title="A figure's graph">
        <GraphDisplay graph={STATIC} title="A figure's graph" />
      </Gallery>
      <Gallery id="static-system" title="A figure's system of inequalities">
        <GraphDisplay graph={SYSTEM} title="A figure's system of inequalities" />
      </Gallery>
      <Gallery id="static-highlight" title="A value read off a graph">
        <GraphDisplay graph={HIGHLIGHT} title="A value read off a graph" />
      </Gallery>
      <Gallery id="workspace" title="The graph workspace" wide>
        <FunctionGraphBuilder question={WORKSPACE} draftKey={WORKSPACE_KEY} onStateChange={ignore} revealPointCorrectness />
      </Gallery>
      <Gallery id="workspace-analysis" title="The graph workspace, reading a graph" wide>
        <GraphAnalysis question={ANALYSIS} onStateChange={ignore} />
      </Gallery>
      <Gallery id="story" title="A graph story's sketch" wide>
        <GraphStory question={STORY} draftKey={STORY_KEY} onStateChange={ignore} />
      </Gallery>
      <Gallery id="rush" title="A rush round's graphs">
        <div className="mm-rush-shell" style={RUSH_SHELL}>
          {RUSH_DOMAIN ? <GraphFeatureRushGraph question={RUSH_DOMAIN} drawing={graphDrawing(RUSH_DOMAIN)} side={300} found={RUSH_FOUND} label="A rush graph, a mark found" /> : <p role="alert">No rush question</p>}
        </div>
        <div className="mm-rush-shell" style={RUSH_SHELL}>
          {RUSH_RANGE ? <GraphFeatureRushGraph question={RUSH_RANGE} drawing={graphDrawing(RUSH_RANGE)} side={300} feedback={RUSH_MISS} label="A rush graph, a tap missed" /> : <p role="alert">No rush question</p>}
        </div>
      </Gallery>
      <Gallery id="line" title="Graph the Line's grid">
        <div className="mm-line-shell" style={LINE_SHELL}>
          <LineGraphCanvas question={GIVEN_LINE} side={300} mode="name" label="A line to name" />
        </div>
        <div className="mm-line-shell" style={LINE_SHELL}>
          <LineGraphCanvas question={{ view: LINE_VIEW }} side={300} mode="draw" label="A line to graph" />
        </div>
      </Gallery>
      <Gallery id="line-reveal" title="A revealed line">
        <LineRevealGraph lineGraph={REVEAL} size={260} />
      </Gallery>
    </main>
  );
}

try {
  window.sessionStorage.setItem('mm-planes-gallery:lines', JSON.stringify(['y = 0.5x + 1', 'y = -x + 2', 'x = -3']));
} catch { /* the calculator then opens with one empty line */ }
seedDrafts();
createRoot(document.getElementById('root')).render(<Planes />);
