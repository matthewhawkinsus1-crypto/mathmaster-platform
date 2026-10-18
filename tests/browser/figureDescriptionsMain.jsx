// One figure-drawing question in the real QuestionEngine, for
// tests/browser/figureDescriptions.mjs (student pass 3, Q-8).
//
//   ?q=interval     Interval Number Line asked for the graph and its notation
//   ?q=numberLine   the legacy pick-a-point number line, with a static
//                   question graph (GraphDisplay) above it
//   ?q=threePlane   the Systems Workspace three-plane model, reveal allowed
//   ?q=construct    the legacy graph workspace: plot two points of y = 2x + 1
//   ?q=analysis     the legacy graph workspace with a given graph to read
//   ?q=story        Graph Story's sketch plane
//   ?role=practice|dol   the activity policy (default practice)
//   ?closed=1       the question is already answered (a closed question)
//   ?locked=1       the assignment is locked (an ended DOL): terminal, nothing shown
//
// All data is synthetic.
import React from 'react';
import { MathfieldElement } from 'mathlive';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const which = params.get('q') || 'interval';
const closed = params.get('closed') === '1';
const locked = params.get('locked') === '1';

const GRAPH = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, line: { m: 1, b: 1 }, points: [{ x: 2, y: 3, label: 'A' }] };
const FIXTURES = {
  interval: {
    type: 'intervalNumberLine', toolId: 'intervalNumberLine',
    prompt: 'Graph x ≥ −3 and x < 5 together, then write it in interval notation.',
    min: -8, max: 8, step: 1, variable: 'x', ask: ['graph', 'interval'],
    intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }],
  },
  numberLine: {
    type: 'numberLine', prompt: 'Select 5 on the number line.', target: 5, choices: [-10, -5, 0, 5, 10],
    graph: GRAPH, graphTitle: 'Question graph',
  },
  threePlane: {
    type: 'systemsWorkspace', mode: 'spatial',
    prompt: 'Explore the three planes, then interpret the solution.',
    spatialModel: { kind: 'threePlanes', allowSolutionReveal: true },
    equations: ['x + y + z = 6', 'x - y + z = 2', '2x + y - z = 1'],
    variables: ['x', 'y', 'z'],
    answerFields: [
      { id: 'count', label: 'How many points do all three planes share?', options: ['None', 'Exactly one', 'Infinitely many'], answer: 'Exactly one' },
    ],
  },
  construct: {
    type: 'functionGraph', prompt: 'Graph y = 2x + 1.',
    functionSpec: { type: 'linear', m: 2, b: 1 },
    graph: { xMin: -4, xMax: 4, yMin: -6, yMax: 8 },
    pointTasks: [
      { id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
      { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 5] },
    ],
  },
  analysis: {
    type: 'graphAnalysis', prompt: 'Read the graph of y = 2x + 1.',
    functionSpec: { type: 'linear', m: 2, b: 1 },
    graph: { xMin: -4, xMax: 4, yMin: -6, yMax: 8 },
    analysisRequests: [{ id: 'at-two', kind: 'value', label: 'The value of $f(2)$', expected: 5 }],
  },
  story: { type: 'graphStory', prompt: 'Sketch a graph for a story.', requireSketch: true },
};

const question = FIXTURES[which] ? { questionId: `figure-description-${which}`, ...FIXTURES[which] } : null;

function Harness() {
  if (!question) return <p role="alert">Unknown fixture {which}.</p>;
  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: 12, fontFamily: 'system-ui' }} data-figure-fixture={which}>
      <QuestionEngine
        key={`${which}-${role}-${closed}-${locked}`}
        assignmentLocked={locked}
        question={question}
        questionRecord={closed ? { status: 'correct', attemptCount: 1, isCorrect: true } : { status: 'unattempted', attemptCount: 0 }}
        activityRole={role}
        maximumAttempts={closed ? 1 : 3}
        draftKey={`figure-description-${which}-${role}-${closed}-${Date.now()}`}
        onGrade={async (isCorrect) => ({ isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 })}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
