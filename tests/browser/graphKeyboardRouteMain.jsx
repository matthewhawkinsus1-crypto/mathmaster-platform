// One graphing question in the real QuestionEngine, for
// tests/browser/graphKeyboardRoute.mjs.
//
//   ?q=investigation   a Function Investigation: plot two points, draw the line,
//                      mark both ends, then give the domain and the range
//   ?q=analysis        a graph to analyse only: a value, the domain, and the
//                      y-intercept typed as a point
//   ?q=construct       graph y = 2x + 1 only: two points, the curve, both ends
//                      (the keyboard-only route, pass 3 TOOL-1)
//   ?q=inverse         y = 2x + 1 and its inverse: reflect two points across
//                      y = x and connect them (TOOL-1, the inverse sketch)
//   ?role=practice|dol the activity policy (default practice)
//   ?plan=keyboard     the student's support plan has the keyboard-access
//                      accommodation (on a DOL it is what offers "Connect my
//                      points": src/platform/graph/connectPointsPolicy.js)
//   ?run=<id>          the draft namespace (a new run starts blank)
//
// Every graded attempt lands in window.__mmGraded, and every support record the
// question reports in window.__mmEvidence. All data is synthetic.
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
const which = params.get('q') || 'investigation';
const run = params.get('run') || 'manual';
const studentProfile = params.get('plan') === 'keyboard' ? { accommodations: ['keyboard-access'] } : null;

const FIXTURES = {
  investigation: {
    type: 'functionInvestigation',
    prompt: 'Graph y = 2x + 1, then give its domain and range.',
    functionSpec: { type: 'linear', m: 2, b: 1 },
    graph: { xMin: -4, xMax: 4, yMin: -6, yMax: 8 },
    pointTasks: [
      { id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
      { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 5] },
    ],
    analysisRequests: [
      { id: 'domain', kind: 'domain', notation: 'interval' },
      { id: 'range', kind: 'range', notation: 'interval' },
    ],
  },
  construct: {
    type: 'functionGraph',
    prompt: 'Graph y = 2x + 1.',
    functionSpec: { type: 'linear', m: 2, b: 1 },
    graph: { xMin: -4, xMax: 4, yMin: -6, yMax: 8 },
    pointTasks: [
      { id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
      { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 5] },
    ],
  },
  inverse: {
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
  },
  analysis: {
    type: 'graphAnalysis',
    prompt: 'Read the graph of y = 2x + 1.',
    functionSpec: { type: 'linear', m: 2, b: 1 },
    graph: { xMin: -4, xMax: 4, yMin: -6, yMax: 8 },
    analysisRequests: [
      { id: 'at-two', kind: 'value', label: 'The value of $f(2)$', expected: 5 },
      { id: 'domain', kind: 'domain', notation: 'interval', label: 'The domain of $f$' },
      { id: 'y-intercept', kind: 'point', feature: 'yIntercept', label: 'The $y$-intercept', responseMode: 'input' },
    ],
  },
};

const question = FIXTURES[which] ? { questionId: `graph-keyboard-${which}`, ...FIXTURES[which] } : null;
window.__mmGraded = [];
window.__mmEvidence = [];

function Harness() {
  if (!question) return <p role="alert">Unknown fixture {which}.</p>;
  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: 12, fontFamily: 'system-ui' }} data-graph-keyboard-fixture={which}>
      <QuestionEngine
        key={`${which}-${role}-${run}`}
        question={question}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        activityRole={role}
        maximumAttempts={3}
        draftKey={`graph-keyboard-${which}-${role}-${run}`}
        studentProfile={studentProfile}
        onSupportEvidence={(evidence) => window.__mmEvidence.push(evidence)}
        onGrade={async (isCorrect, details, parts) => {
          window.__mmGraded.push({ isCorrect, parts });
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
