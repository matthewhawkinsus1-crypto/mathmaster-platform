// One registry-tool question in the real QuestionEngine, under the activity
// role in the URL. Driven by tests/browser/toolPolicyGates.mjs.
//
//   ?role=practice|dol|quiz|test   the activity policy (default practice)
//   ?tool=bridge     the classic Representation Bridge (checkpoint timing, the
//                    default), general + factored form stages, with an authored
//                    hint for the Work View Help drawer
//   ?tool=mapping    a standalone Relation Mapping question (has a HintPanel)
//   ?tool=composed   the same relation as a composed question: its mapping
//                    stage mounts RelationMapping inside WorkflowRunner
//   ?tool=graphing   Graphing2, whose Work View Help is its HintPanel
//   ?tool=step       a step-algebra solve, with its "Need a strategic hint?"
//
// What the engine would submit lands in window.__mmGraded.
import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/index.css';

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const tool = params.get('tool') || 'bridge';

// The driver looks for this exact text in the Work View Help drawer.
const AUTHORED_BRIDGE_HINT = 'AUTHORED-BRIDGE-HINT: start from the row where x is 0.';

const relation = [[1, 2], [3, 4], [5, 6]];

const QUESTIONS = {
  bridge: {
    id: 'policy-gates-bridge',
    type: 'representationBridge',
    mode: 'linear',
    prompt: 'Connect the representations of this relationship.',
    source: { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] },
    context: {
      inputLabel: 'items sold', outputLabel: 'profit', inputUnit: 'items', outputUnit: 'dollars',
      rateUnit: 'dollars per item', rateMeaning: 'profit earned for each item sold',
      yInterceptMeaning: 'starting profit after paying the booth fee',
      zeroMeaning: 'number of items that must be sold to break even',
    },
    requiredStages: ['generalForm', 'factoredForm'],
    hints: [AUTHORED_BRIDGE_HINT],
  },
  mapping: {
    id: 'policy-gates-mapping',
    type: 'relationMapping',
    prompt: 'Build the mapping diagram for this relation.',
    pairs: relation,
    ask: ['mapping'],
  },
  composed: {
    id: 'policy-gates-composed',
    type: 'relationMapping',
    prompt: 'Represent this relation.',
    pairs: relation,
    recipe: { name: 'relationRepresentations', ask: ['mapping', 'domain'] },
  },
  step: {
    id: 'policy-gates-step',
    type: 'stepAlgebra',
    prompt: 'Solve for x.',
    equation: '2x+3=11',
  },
  graphing: {
    id: 'policy-gates-graphing',
    type: 'graphing2',
    mode: 'slopeIntercept',
    prompt: 'Graph the line y = 2x + 1.',
    line: { m: 2, b: 1 },
  },
};

window.__mmGraded = null;

function Harness() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <QuestionEngine
        question={QUESTIONS[tool]}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        maximumAttempts={role === 'practice' ? 3 : 1}
        activityRole={role}
        draftKey={`tool-policy-gates-${role}-${tool}-${params.get('run') || 'a'}`}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey) => {
          window.__mmGraded = { isCorrect, parts, supportUsage, responseKey };
          return { isCorrect, status: isCorrect ? 'correct' : 'expired', attemptCount: 1, remainingAttempts: 0 };
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
