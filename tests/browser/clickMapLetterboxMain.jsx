// The three click surfaces that used to map a tap with a straight box-to-viewBox
// stretch (platform quirks audit PQ-034). Driven by tests/browser/clickMapLetterbox.mjs.
//
//   ?surface=interval   IntervalNumberLine (registry tool), its number line
//   ?surface=relation   RelationMapping (registry tool) asked to plot the pairs
//   ?surface=story      GraphStory (QuestionEngine module), its sketch plane
//   ?surface=relation-question
//                       the same RelationMapping question inside the real
//                       QuestionEngine and App.jsx's assignment wrappers, so a
//                       phone held sideways gets the real landscape layout —
//                       whose `.mathmaster-tool-panel svg { max-height: 62dvh }`
//                       letterboxes the square plot without any help from here.
//   ?cap=0.55           after mount, cap the surface's height at this fraction
//                       of its natural height: the drawing is then letterboxed
//                       ("xMidYMid meet") the way any future height cap would
//                       letterbox it.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import IntervalNumberLine from '../../src/tools/intervalNumberLine/IntervalNumberLine.jsx';
import RelationMapping from '../../src/tools/relationMapping/RelationMapping.jsx';
import GraphStory from '../../src/GraphStory.jsx';
import '../../src/index.css';
import '../../src/App.css';

const params = new URLSearchParams(window.location.search);
const surface = params.get('surface') || 'interval';
const cap = Number(params.get('cap')) || 0;

const RELATION = { id: 'click-map-relation', type: 'relationMapping', prompt: 'Plot every ordered pair of this relation.', pairs: [[-2, 3], [1, 2], [3, -1]], ask: ['plot'] };
const INTERVAL = { id: 'click-map-interval', min: -8, max: 8, step: 1, variable: 'x', ask: ['graph'], intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }] };
const STORY = { id: 'click-map-story', type: 'graphStory', prompt: 'Sketch a graph for a story.', requireSketch: true };

const SURFACE_SELECTOR = {
  interval: 'svg[aria-label^="Number line"]',
  relation: 'svg[aria-label="Coordinate plane for plotting the relation"]',
  'relation-question': 'svg[aria-label="Coordinate plane for plotting the relation"]',
  story: 'svg[aria-label="Blank coordinate plane for graph story"]',
};
window.__clickMap = { surface, selector: SURFACE_SELECTOR[surface], capped: null };

function Cap() {
  useEffect(() => {
    if (!cap) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const svg = document.querySelector(SURFACE_SELECTOR[surface]);
      if (!svg) return;
      const natural = svg.getBoundingClientRect().height;
      svg.style.maxHeight = `${Math.round(natural * cap)}px`;
      window.__clickMap.capped = { natural: Math.round(natural), capped: Math.round(svg.getBoundingClientRect().height) };
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return null;
}

function Direct() {
  const [, setState] = useState(null);
  if (surface === 'interval') return <IntervalNumberLine questionData={INTERVAL} onAction={() => {}} />;
  if (surface === 'relation') return <RelationMapping questionData={RELATION} onAction={() => {}} />;
  return <GraphStory question={STORY} onStateChange={setState} onUndoStateChange={() => {}} feedback={null} draftKey={null} />;
}

function InQuestion() {
  // App.jsx's three wrappers, so the phone layout and its landscape rules apply.
  return (
    <div className="mathmaster-assignment-screen" style={{ backgroundColor: '#f0f2f5', minHeight: '100vh', padding: 20 }}>
      <div className="mathmaster-assignment-shell" style={{ maxWidth: 1120, margin: '0 auto' }}>
        <main className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: 12, padding: 10 }}>
          <QuestionEngine
            question={RELATION}
            questionRecord={null}
            maximumAttempts={3}
            activityRole="practice"
            draftKey={`click-map-${params.get('run') || 'a'}`}
            onGrade={() => null}
          />
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ padding: surface === 'relation-question' ? 0 : 16, fontFamily: 'system-ui' }}>
    {surface === 'relation-question' ? <InQuestion /> : <Direct />}
    <Cap />
  </div>,
);
