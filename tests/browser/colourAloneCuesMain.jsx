/*
 * EVERYTHING THAT WAS TOLD APART BY COLOUR ALONE, ON ONE PAGE (WCAG 1.4.1).
 *
 *   open http://127.0.0.1:5198/tests/browser/colourAloneCues.html
 *
 * tests/browser/colourAloneCues.mjs reads each scene here in the app's light and
 * dark themes, at a laptop's and a phone's size, and fails one whose two things
 * are told apart by colour alone: My Math Path's mastery wheel at every level
 * with both kinds of round done and its key, the CCMR readiness wheel in every
 * state, and the planes that drew two lines alike but for their colour (the
 * Inverse & Composition Lab's f and y = x, the Exponential ↔ Log Bridge's, the
 * Systems Workspace's two non-strict boundaries in both its modes, the
 * Transformations Lab's source and image, the graph workspace's curve and its
 * inverse, a figure's two named solid functions, and Graph the Line's line drawn
 * without the method). Each is mounted with its real component and props, in the
 * state a student sees it in. Nothing is restyled: the page takes the app's
 * stylesheets, and its theme from <html data-theme>, as the app's pages do.
 *
 * Every scene is in `[data-cue-scene]`. All data is synthetic.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MyMathPathDashboard from '../../src/components/student/MyMathPathDashboard.jsx';
import CCMRReadinessWheel from '../../src/components/student/CCMRReadinessWheel.jsx';
import InverseCompositionLab from '../../src/tools/inverseComposition/InverseCompositionLab.jsx';
import ExponentialLogBridge from '../../src/tools/exponentialLog/ExponentialLogBridge.jsx';
import SystemsWorkspace from '../../src/tools/systemsWorkspace/SystemsWorkspace.jsx';
import TransformationsLab from '../../src/tools/transformations/TransformationsLab.jsx';
import FunctionGraphBuilder from '../../src/FunctionGraphBuilder.jsx';
import GraphDisplay from '../../src/GraphDisplay.jsx';
import LineGraphCanvas from '../../src/components/liveChallenge/LineGraphCanvas.jsx';
import { ARENA_LINE_VARS } from '../../src/components/liveChallenge/grandPrixTheme.js';
import { pointsKey } from '../../src/platform/liveChallenge/lineGraphModel.js';
import { ToolDraftScopeProvider, toolDraftKey } from '../../src/tools/shared/usePersistentToolState.js';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import { MASTERY_STATUS_COLORS, getMasteryStrands } from '../../src/platform/mastery/strandConfig.js';
import { READINESS } from '../../src/platform/ccmr/assessmentPathways.js';
import { writeQuestionDraft } from '../../src/questionDraftStorage.js';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/ui/uiKit.css';

const ignore = () => {};

// ------------------------------------------------------------------ My Math Path
// Every mastery level in turn round the wheel, a practice round done on some
// skills and a Level 3 round on others, and a skill whose retention is a concern.
const LEVELS = Object.keys(MASTERY_STATUS_COLORS);
const WHEEL_CODES = getMasteryStrands('algebra1').flatMap((strand) => strand.codes);
const MASTERY = Object.fromEntries(WHEEL_CODES.map((code, index) => [code, {
  mastery: { status: LEVELS[index % LEVELS.length], estimate: null },
  signals: { retention: index === 7 ? 'concern' : 'stable' },
}]));
const PASSES = Object.fromEntries(WHEEL_CODES.flatMap((code, index) => (index % 6 === 0 ? [[code, { passesCompleted: 1 }]] : index % 6 === 3 ? [[code, { passesCompleted: 3 }]] : [])));

// ------------------------------------------------------------------ the CCMR readiness wheel
// One domain in each of the seven states (domainReadiness.js).
const practised = (status) => ({ status, evidenceBasis: 'direct', assessmentProficiency: 0.7 });
const READINESS_DOMAINS = [
  ['strong', 'Strong domain', [practised(READINESS.STRONG)]],
  ['developing', 'Developing domain', [practised(READINESS.READY), practised(READINESS.READY)]],
  ['gap', 'Transfer gap domain', [{ status: READINESS.TRANSFER_GAP }]],
  ['recommended', 'Recommended domain', [{ status: READINESS.RECOMMENDED }]],
  ['prerequisite', 'Prerequisite domain', [{ status: READINESS.STRENGTHEN }]],
  ['ready', 'Ready domain', [{ status: READINESS.READY }]],
  ['none', 'Unmatched domain', []],
];
const READINESS_RECOMMENDATIONS = {
  profile: { displayName: 'Practice test', domains: READINESS_DOMAINS.map(([id, title]) => ({ id, title, weight: 1 })) },
  byDomain: READINESS_DOMAINS.map(([domainId, , items]) => ({ domainId, items })),
};

// ------------------------------------------------------------------ the Transformations Lab, plot mode
// The Lab's sample (S1, S2, S3), with the student's first two images plotted. On the page, not in Work View.
const TRANSFORM_KEY = 'mm-colour-cues:transformations';

// ------------------------------------------------------------------ the graph workspace, building the inverse
// y = 2x + 1 from two points, its inverse from the two reflected points: both
// curves drawn, as a reload finds the work.
const WORKSPACE_KEY = 'mm-colour-cues:workspace';
const WORKSPACE = {
  questionId: 'colour-cues-inverse',
  // On the page, not in Work View, which an aiming tool opens on its own on a wide screen.
  presentEnlarged: false,
  type: 'functionInvestigation',
  prompt: 'Graph y = 2x + 1, then reflect it across y = x.',
  functionSpec: { type: 'linear', m: 2, b: 1 },
  graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6 },
  pointTasks: [
    { id: 'p0', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
    { id: 'p1', label: 'Plot the point where x = 1', x: 1, expected: [1, 3] },
  ],
  inverseReflection: { enabled: true, sourceTaskIds: ['p0', 'p1'], requireInverseSketch: true, requireInverseEquation: true, equationPartId: 'inverse-equation' },
  analysisRequests: [
    { id: 'inverse-reflect-p0', kind: 'inversePoint', label: 'Reflect the point at x = 0', sourceTaskId: 'p0', responseMode: 'click' },
    { id: 'inverse-reflect-p1', kind: 'inversePoint', label: 'Reflect the point at x = 1', sourceTaskId: 'p1', responseMode: 'click' },
    { id: 'inverse-equation', kind: 'value', label: 'The inverse equation', notation: 'equation', responseMode: 'text', expected: ['y=(x-1)/2'] },
  ],
};

// ------------------------------------------------------------------ a figure with two named solid functions
// Two solid lines an author told apart by colour and named, and a named point on one of them.
const FIGURE = {
  xMin: -6, xMax: 6, yMin: -6, yMax: 6,
  functions: [{ type: 'line', m: 0.5, b: 1, label: 'f' }, { type: 'line', m: -1, b: 3, label: 'g', stroke: '#d93025' }],
  points: [{ x: 2, y: 2, label: 'P' }],
};

// ------------------------------------------------------------------ Graph the Line
const tokens = (text) => Object.fromEntries(String(text).split(';').map((entry) => entry.trim()).filter(Boolean)
  .map((entry) => [entry.slice(0, entry.indexOf(':')).trim(), entry.slice(entry.indexOf(':') + 1).trim()]));
const LINE_SHELL = { ...tokens(ARENA_LINE_VARS), '--mm-line-label-bg': 'var(--mm-graph-bg)', '--mm-line-label-text': 'var(--mm-graph-label)', padding: 12, borderRadius: 12, background: '#0b1240', display: 'inline-block' };
const LINE_VIEW = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

// A round that asks for the method judges every line the student draws as the right line drawn without it
// (LineGraphRound's verdict for LINE_VERDICT.METHOD): the line takes the method's colour and, now, its badge.
function LineWithoutMethod() {
  const [verdict, setVerdict] = useState(null);
  return (
    <div className="mm-line-shell" style={LINE_SHELL}>
      <LineGraphCanvas question={{ view: LINE_VIEW }} side={300} mode="draw" verdict={verdict} onLine={(points) => setVerdict({ key: pointsKey(points), kind: 'method' })} label="A line drawn without the method" />
    </div>
  );
}

const seedDrafts = () => {
  writeQuestionDraft(toolDraftKey(TRANSFORM_KEY), { plottedPoints: [[0, -3], [2, -1]] }, { edit: true });
  writeQuestionDraft(`${WORKSPACE_KEY}:graph-stage`, 'analysis', { edit: true });
  writeQuestionDraft(`${WORKSPACE_KEY}:graph-construction`, {
    placements: { p0: [0, 1], p1: [1, 3] }, chosenXValues: { p0: '0', p1: '1' }, pointsValidated: true,
    strokes: [], sketchView: null, snapped: true, markerPlacements: { 'endpoint-0-start': 'arrow', 'endpoint-0-end': 'arrow' },
  }, { edit: true });
  writeQuestionDraft(`${WORKSPACE_KEY}:graph-analysis`, {
    selections: { 'inverse-reflect-p0': [[1, 0]], 'inverse-reflect-p1': [[3, 1]] }, answers: {}, typedPoints: {}, noneSelections: {},
    inversePointsValidated: true, inverseStrokes: [], inverseSketchView: null, inverseSnapped: true,
  }, { edit: true });
};

// ------------------------------------------------------------------ the page
const Scene = ({ id, title, children, wide = false }) => (
  <section data-cue-scene={id} aria-label={title} style={{ display: 'grid', gap: 8, minWidth: 0, alignContent: 'start', gridColumn: wide ? '1 / -1' : undefined }}>
    <h2 style={{ margin: 0, fontSize: 'calc(16 * var(--mm-px))' }}>{title}</h2>
    {children}
  </section>
);

function Cues() {
  return (
    // The screen's width (the app's root lays its child out as a flex item, which would grow to the widest scene).
    <main style={{ padding: 16, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', width: '100%', minWidth: 0, maxWidth: 1340, margin: '0 auto', boxSizing: 'border-box' }}>
      <Scene id="mastery-wheel" title="My Math Path's mastery wheel and its key" wide>
        <MyMathPathDashboard studentName="Avery" masteryProfilesByTEKS={MASTERY} skillProgressByTEKS={PASSES} courseId="algebra1" onStartSession={ignore} />
      </Scene>
      <Scene id="readiness-wheel" title="The CCMR readiness wheel">
        <CCMRReadinessWheel recommendations={READINESS_RECOMMENDATIONS} onSelectDomain={ignore} />
      </Scene>
      <Scene id="inverse-lab" title="Inverse & Composition Lab" wide>
        <InverseCompositionLab questionData={SAMPLE_SPECS.inverseCompositionLab} onAction={ignore} />
      </Scene>
      <Scene id="exp-log" title="Exponential ↔ Log Bridge" wide>
        <ExponentialLogBridge questionData={SAMPLE_SPECS.exponentialLogBridge} onAction={ignore} />
      </Scene>
      <Scene id="systems" title="Systems Workspace: two non-strict boundaries" wide>
        <SystemsWorkspace questionData={{ mode: 'inequalities' }} onAction={ignore} />
      </Scene>
      <Scene id="systems-build" title="Systems Workspace, built by the student" wide>
        <SystemsWorkspace questionData={{ mode: 'inequalities', studentBuild: { shading: true } }} onAction={ignore} />
      </Scene>
      <Scene id="transformations" title="Transformations Lab, plot mode" wide>
        <ToolDraftScopeProvider draftKey={TRANSFORM_KEY}>
          <TransformationsLab questionData={{ ...SAMPLE_SPECS.transformationsLab, presentEnlarged: false }} onAction={ignore} />
        </ToolDraftScopeProvider>
      </Scene>
      <Scene id="workspace-inverse" title="The graph workspace, building the inverse" wide>
        <FunctionGraphBuilder question={WORKSPACE} draftKey={WORKSPACE_KEY} onStateChange={ignore} revealPointCorrectness />
      </Scene>
      <Scene id="static-figure" title="A figure with two named solid functions">
        <GraphDisplay graph={FIGURE} title="A figure with two named solid functions" />
      </Scene>
      <Scene id="line-method" title="Graph the Line: the right line, drawn without the method">
        <LineWithoutMethod />
      </Scene>
    </main>
  );
}

seedDrafts();
createRoot(document.getElementById('root')).render(<Cues />);
