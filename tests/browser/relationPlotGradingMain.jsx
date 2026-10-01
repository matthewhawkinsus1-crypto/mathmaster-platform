// A relation question whose recipe asks for a plot, in the real QuestionEngine
// (WorkflowRunner + InteractiveGraphWorkspace). Driven by
// tests/browser/relationPlotGrading.mjs.
//
//   ?role=practice|dol   the activity policy (default practice)
//   ?pairs=nonfunction   a relation with two points at x = 1
//
// What the engine would submit lands in window.__mmGraded.
import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/index.css';

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const pairs = params.get('pairs') === 'nonfunction'
  ? [[1, 2], [1, 5], [3, 4]]
  : [[-2, 3], [1, 2], [3, -1], [-4, -3]];

const question = {
  id: `relation-plot-grading-${params.get('pairs') || 'function'}`,
  type: 'relationMapping',
  prompt: 'Plot this relation.',
  pairs,
  recipe: { name: 'relationRepresentations', ask: ['plot'] },
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
        draftKey={`relation-plot-grading-${role}-${params.get('pairs') || 'function'}-${params.get('run') || 'a'}`}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey) => {
          window.__mmGraded = { isCorrect, parts, responseKey };
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
