// One graphing question in the real QuestionEngine, under the activity role in
// the URL. Driven by tests/browser/graphPointCheck.mjs.
//
//   ?role=practice|dol|quiz|test   the activity policy (default practice)
//   ?plot=points                   a point-only plot instead of a curve
//   ?inverse=1                     a point-only plot, then reflect it across
//                                  y = x (functionInvestigation)
//
// What the engine would submit lands in window.__mmGraded.
import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/index.css';

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const inverse = params.get('inverse') === '1';
const pointOnly = inverse || params.get('plot') === 'points';
const variant = inverse ? 'inverse' : pointOnly ? 'points' : 'curve';

const question = {
  id: `graph-point-check-${variant}`,
  type: inverse ? 'functionInvestigation' : 'functionGraph',
  prompt: 'Graph y = 2x + 1.',
  functionSpec: { type: 'linear', m: 2, b: 1 },
  pointOnly,
  pointTasks: [
    { id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
    { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 5] },
  ],
  ...(inverse ? {
    inverseReflection: { enabled: true, sourceTaskIds: ['p1', 'p2'], requireInverseSketch: false },
    analysisRequests: [
      { id: 'r1', kind: 'inversePoint', sourceTaskId: 'p1', label: 'Reflect the point at x = 0' },
      { id: 'r2', kind: 'inversePoint', sourceTaskId: 'p2', label: 'Reflect the point at x = 2' },
    ],
  } : {}),
};

window.__mmGraded = null;

function Harness() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <QuestionEngine
        question={question}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        maximumAttempts={3}
        activityRole={role}
        draftKey={`graph-point-check-${role}-${variant}-${params.get('run') || 'a'}`}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey) => {
          window.__mmGraded = { isCorrect, parts, responseKey };
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
