/*
 * EVERY OTHER DRAWING THAT SAYS SOMETHING, WITH WHAT EACH DRAWS, ON ONE PAGE.
 *
 *   open http://127.0.0.1:5198/tests/browser/forcedColorsDrawings.html
 *
 * The forced-colours walk reads the drawings the certified scenes and the Math
 * Tools Lab show (forcedColorsCertification.mjs): the Lab's number line and
 * mapping diagram, in each tool and its Work View. The rest are on no certified
 * scene: Inequality Graphing Rush's number line, the 3D model of three planes,
 * My Math Path's mastery wheel and its colour key, the CCMR readiness wheel and
 * the lines a graph-to-scenario match draws. Each is here, mounted with its real
 * component and props, in the state a student sees it in: endpoints placed and
 * one being placed, rays shaded, arrows drawn, the planes and their common point
 * shown, every mastery level and readiness state, rounds done and a skill to
 * re-check, a match made. Nothing is restyled here: the page takes the app's
 * stylesheets, and its theme from <html data-theme>, as the app's pages do.
 *
 * Every drawing is in `[data-drawing-gallery]`; the walk reads the drawings in
 * them (`[data-mm-drawing]`). All data is synthetic.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import IntervalNumberLine from '../../src/tools/intervalNumberLine/IntervalNumberLine.jsx';
import InequalityNumberLine from '../../src/components/liveChallenge/InequalityNumberLine.jsx';
import RelationMapping from '../../src/tools/relationMapping/RelationMapping.jsx';
import ThreePlaneWorkspace from '../../src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx';
import MyMathPathDashboard from '../../src/components/student/MyMathPathDashboard.jsx';
import CCMRReadinessWheel from '../../src/components/student/CCMRReadinessWheel.jsx';
import GraphScenarioMatch from '../../src/GraphScenarioMatch.jsx';
import { ToolDraftScopeProvider, toolDraftKey } from '../../src/tools/shared/usePersistentToolState.js';
import { ARENA_RUSH_VARS } from '../../src/components/liveChallenge/grandPrixTheme.js';
import { MASTERY_STATUS_COLORS, getMasteryStrands } from '../../src/platform/mastery/strandConfig.js';
import { getAssessmentProfile } from '../../src/platform/ccmr/assessmentProfiles.js';
import { READINESS } from '../../src/platform/ccmr/assessmentPathways.js';
import { writeQuestionDraft } from '../../src/questionDraftStorage.js';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/ui/uiKit.css';

// What a tool hands its host (the answer it would grade): nothing to do here.
const ignore = () => {};

// ------------------------------------------------------------------ the number line
// A closed ray to the left, a segment open at one end and closed at the other,
// and an endpoint still being placed (open on one line, closed and beside a ray
// on the other): every mark the tool draws. Seeded as a reload finds the work.
// On the page, not in Work View, which the tool opens on its own on a wide
// screen (the Lab's scenes read it there).
const NUMBER_LINE = { min: -8, max: 8, step: 1, variable: 'x', ask: ['graph', 'interval'], intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }], presentEnlarged: false };
const NUMBER_LINE_KEYS = ['mm-drawings-gallery:number-line-a', 'mm-drawings-gallery:number-line-b'];
// A ray's infinite end is stored as null (normalizeInterval).
const NUMBER_LINE_WORK = [
  { built: [{ min: null, max: -5, minClosed: false, maxClosed: true }, { min: -2, max: 3, minClosed: false, maxClosed: true }], pending: { value: 6, closed: false } },
  { built: [{ min: 4, max: null, minClosed: true, maxClosed: false }], pending: { value: -1, closed: true } },
];

// ------------------------------------------------------------------ Inequality Graphing Rush
// A round's line is drawn on the Grand Prix's glass, its tokens set on the
// round's shell (GraphFeatureRushRound.jsx); here on a box of the shell's own
// class (without the round's stylesheet, which lays the shell over the whole
// screen), with the same tokens. A student's drawing (x ≥ 2: a closed dot and a
// ray), another (x < −1: an open dot and a ray the other way), and the answer
// the round shows after a third miss (−3 < x ≤ 4).
const tokens = (text) => Object.fromEntries(String(text).split(';').map((entry) => entry.trim()).filter(Boolean)
  .map((entry) => [entry.slice(0, entry.indexOf(':')).trim(), entry.slice(entry.indexOf(':') + 1).trim()]));
const RUSH_SHELL = { ...tokens(ARENA_RUSH_VARS), padding: 12, borderRadius: 12, background: '#0b1240', display: 'inline-block', maxWidth: '100%', boxSizing: 'border-box' };
const RUSH_LINE = { min: -10, max: 10, step: 1 };
const RUSH_ITEMS = [
  { id: 'ray', label: 'x ≥ 2, drawn', question: { questionIndex: 0, prompt: 'Graph x ≥ 2', numberLine: RUSH_LINE }, drawing: { points: [{ value: 2, closed: true }], left: false, right: true } },
  { id: 'open', label: 'x < −1, drawn', question: { questionIndex: 1, prompt: 'Graph x < −1', numberLine: RUSH_LINE }, drawing: { points: [{ value: -1, closed: false }], left: true, right: false } },
  { id: 'answer', label: 'The answer to −3 < x ≤ 4, shown', question: { questionIndex: 2, prompt: 'Graph −3 < x ≤ 4', numberLine: RUSH_LINE }, drawing: null, reveal: { points: [{ value: -3, closed: false }, { value: 4, closed: true }], left: false, right: false } },
];

// ------------------------------------------------------------------ the mapping diagram
// Four pairs, two arrows drawn (a domain value is chosen in the walk's second scene).
const MAPPING_KEY = 'mm-drawings-gallery:mapping';
const MAPPING = { pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }, { x: 4, y: 2 }], ask: ['mapping', 'domain', 'range', 'isFunction'] };

// ------------------------------------------------------------------ the 3D model
// Three planes that meet at one point, the lines where each two cross, and the
// point itself (revealed).
const THREE_PLANES = {
  mode: 'spatial',
  prompt: 'Explore the three planes.',
  spatialModel: { kind: 'threePlanes', revealSolution: true },
  equations: ['x + y + z = 6', 'x - y + z = 2', '2x + y - z = 1'],
  variables: ['x', 'y', 'z'],
  answerFields: [],
};

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
// Each readiness state a domain can be in, over two assessments' wheels (four
// domains and four): strong, developing, a transfer gap and no alignment yet; a
// prerequisite to strengthen, recommended, ready but not practised, strong.
const practised = (status, assessmentProficiency) => ({ status, evidenceBasis: 'direct', assessmentProficiency });
const SAT = {
  profile: getAssessmentProfile('digitalSAT'),
  byDomain: [
    { domainId: 'algebra', items: [practised(READINESS.STRONG, 0.9), practised(READINESS.STRONG, 0.85)] },
    { domainId: 'advancedMath', items: [practised(READINESS.READY, 0.55), practised(READINESS.STRONG, 0.8)] },
    { domainId: 'problemSolvingData', items: [practised(READINESS.TRANSFER_GAP, 0.4)] },
  ],
};
const TSIA = {
  profile: getAssessmentProfile('tsia2'),
  byDomain: [
    { domainId: 'quantitativeReasoning', items: [{ status: READINESS.STRENGTHEN }] },
    { domainId: 'algebraicReasoning', items: [{ status: READINESS.RECOMMENDED }] },
    { domainId: 'geometricSpatial', items: [{ status: READINESS.READY }] },
    { domainId: 'probabilisticStatistical', items: [practised(READINESS.STRONG, 0.9)] },
  ],
};

// ------------------------------------------------------------------ a graph matched to a story
const MATCH_KEY = 'mm-drawings-gallery:scenario-match';
const MATCH = {
  questionId: 'drawings-gallery-match',
  type: 'graphScenarioMatch',
  prompt: 'Match each story to its graph.',
  graphs: [
    { id: 'g1', graph: { xMin: 0, xMax: 4, yMin: 0, yMax: 8, functions: [{ type: 'line', m: 2, b: 0 }] } },
    { id: 'g2', graph: { xMin: 0, xMax: 4, yMin: 0, yMax: 8, functions: [{ type: 'line', m: -2, b: 8 }] } },
  ],
  scenarios: [{ id: 's1', description: 'Water fills a tank steadily.' }, { id: 's2', description: 'Water drains from a tank steadily.' }],
};

const seedDrafts = () => {
  NUMBER_LINE_KEYS.forEach((key, index) => writeQuestionDraft(toolDraftKey(key), NUMBER_LINE_WORK[index], { edit: true }));
  writeQuestionDraft(toolDraftKey(MAPPING_KEY), { arrows: [[-2, 3], [1, 2]] }, { edit: true });
  writeQuestionDraft(`${MATCH_KEY}:graph-scenario-match`, { s1: 'g1' }, { edit: true });
};

// ------------------------------------------------------------------ the page
const Gallery = ({ id, title, children, wide = false }) => (
  <section data-drawing-gallery={id} aria-label={title} style={{ display: 'grid', gap: 8, minWidth: 0, alignContent: 'start', gridColumn: wide ? '1 / -1' : undefined }}>
    <h2 style={{ margin: 0, fontSize: 'calc(16 * var(--mm-px))' }}>{title}</h2>
    {children}
  </section>
);

function Drawings() {
  return (
    // The screen's width (the app's root lays its child out as a flex item, which would grow to the widest drawing).
    <main style={{ padding: 16, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', width: '100%', minWidth: 0, maxWidth: 1340, margin: '0 auto', boxSizing: 'border-box' }}>
      <Gallery id="number-line" title="The number line" wide>
        {NUMBER_LINE_KEYS.map((key) => (
          <ToolDraftScopeProvider key={key} draftKey={key}>
            <IntervalNumberLine questionData={NUMBER_LINE} onAction={ignore} />
          </ToolDraftScopeProvider>
        ))}
      </Gallery>
      <Gallery id="rush-number-line" title="Inequality Graphing Rush's number line">
        {RUSH_ITEMS.map((item) => (
          <div key={item.id} className="mm-rush-shell" style={RUSH_SHELL}>
            <InequalityNumberLine question={item.question} drawing={item.drawing} reveal={item.reveal || null} width={360} height={104} onTap={ignore} label={item.label} />
          </div>
        ))}
      </Gallery>
      <Gallery id="mapping" title="The mapping diagram" wide>
        <ToolDraftScopeProvider draftKey={MAPPING_KEY}>
          <RelationMapping questionData={MAPPING} onAction={ignore} />
        </ToolDraftScopeProvider>
      </Gallery>
      <Gallery id="three-planes" title="The 3D model" wide>
        <ThreePlaneWorkspace questionData={THREE_PLANES} onAction={ignore} />
      </Gallery>
      <Gallery id="mastery-wheel" title="My Math Path's mastery wheel and its key" wide>
        <MyMathPathDashboard studentName="Avery" masteryProfilesByTEKS={MASTERY} skillProgressByTEKS={PASSES} courseId="algebra1" onStartSession={ignore} />
      </Gallery>
      <Gallery id="ccmr-wheel" title="The CCMR readiness wheels">
        <CCMRReadinessWheel recommendations={SAT} onSelectDomain={ignore} />
        <CCMRReadinessWheel recommendations={TSIA} onSelectDomain={ignore} />
      </Gallery>
      <Gallery id="scenario-match" title="A graph matched to a story" wide>
        <GraphScenarioMatch question={MATCH} draftKey={MATCH_KEY} onStateChange={ignore} />
      </Gallery>
    </main>
  );
}

seedDrafts();
createRoot(document.getElementById('root')).render(<Drawings />);
