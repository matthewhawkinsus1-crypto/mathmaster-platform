// One composed (multi-step) question in the real QuestionEngine, under the
// activity role in the URL. Driven by tests/browser/composedOutcomePolicy.mjs.
//
//   ?role=practice|dol|quiz|test   the activity policy (default practice)
//   ?q=model                       table -> graph -> domain -> range, the table
//                                  checked against the AUTHORED function (the
//                                  functionModeling recipe without an equation)
//   ?q=mapping                     a mapping diagram (a registry tool) -> domain
//
// What the engine would submit lands in window.__mmGraded.
import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/index.css';

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const which = params.get('q') || 'model';

const QUESTIONS = {
  model: {
    id: 'composed-outcome-model',
    type: 'relationshipModel',
    prompt: 'A pattern follows y = 2x + 1.',
    recipe: { name: 'functionModeling', ask: ['table', 'graph', 'domain', 'range'] },
    functionSpec: { type: 'linear', m: 2, b: 1 },
    graphMode: 'continuous',
    tableXValues: [0, 1, 2],
    graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
    correctDomain: '(-\\infty, \\infty)',
    correctRange: '(-\\infty, \\infty)',
  },
  mapping: {
    id: 'composed-outcome-mapping',
    type: 'relationMapping',
    prompt: 'The relation {(1, 2), (2, 4), (3, 6)}.',
    recipe: { name: 'relationRepresentations', ask: ['mapping', 'domain'] },
    pairs: [[1, 2], [2, 4], [3, 6]],
  },
};

window.__mmGraded = null;

function Harness() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <QuestionEngine
        question={QUESTIONS[which]}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        maximumAttempts={3}
        activityRole={role}
        draftKey={`composed-outcome-${role}-${which}-${params.get('run') || 'a'}`}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey) => {
          window.__mmGraded = { isCorrect, parts, responseKey };
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
