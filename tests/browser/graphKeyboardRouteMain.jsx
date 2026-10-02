// One graphing question in the real QuestionEngine, for
// tests/browser/graphKeyboardRoute.mjs.
//
//   ?q=investigation   a Function Investigation: plot two points, draw the line,
//                      mark both ends, then give the domain and the range
//   ?q=analysis        a graph to analyse only: a value, the domain, and the
//                      y-intercept typed as a point
//   ?role=practice|dol the activity policy (default practice)
//   ?run=<id>          the draft namespace (a new run starts blank)
//
// Every graded attempt lands in window.__mmGraded. All data is synthetic.
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
        onGrade={async (isCorrect, details, parts) => {
          window.__mmGraded.push({ isCorrect, parts });
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
