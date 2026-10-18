// One registry-tool question in the real QuestionEngine, with "Ask my teacher"
// wired as the student app wires it. Driven by tests/browser/workViewHelpReach.mjs.
//
//   ?role=practice|dol   the activity policy (default practice)
//   ?tool=matrix         Matrix Lab, "complete the system": its TaskCard
//                        states the rule that tells none from many (R-10)
//   ?tool=transform      Transformations Lab, map a point: its bridge and
//                        first step are the mapping rule
//   ?tool=graphing       Graphing2, whose steps only say how to plot
//   ?tool=matrixSolve    Matrix Lab, solve with technology: its description
//                        and directions name the route ("X = A⁻¹B")
//   ?tool=balance        a stored stepAlgebra2 item with no mode: under a
//                        server-graded host it opens the legacy balance
//                        solver, whose own Help states the method
//   ?grading=server      a server-graded host (My Math Path, Corrections):
//                        no platform ladder, the tool keeps its own hints
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/index.css';
import '../../src/App.css';

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const tool = params.get('tool') || 'matrix';

const QUESTIONS = {
  matrix: {
    questionId: 'wv-help-matrix',
    type: 'matrixLab',
    mode: 'completeSystem',
    targets: [{ id: 'none', classification: 'none' }, { id: 'many', classification: 'many' }],
    equations: ['5x - 3y + z = -4', 'x + 2y - 3z = 0'],
    prompt: 'Two of the three equations of a system are given. Write a third equation that gives a system with NO solution, and another that gives INFINITELY MANY solutions.',
    hints: ['Start from a multiple of the first equation: every coefficient times 2.'],
  },
  transform: {
    questionId: 'wv-help-transform',
    type: 'transformationsLab',
    mode: 'pointMap',
    family: 'quadratic',
    function: { type: 'quadratic', a: 2, b: 1, h: 1, k: 3 },
    parentPoint: [1, 1],
    prompt: 'Map the parent point (1, 1) through the transformation.',
  },
  matrixSolve: {
    questionId: 'wv-help-matrix-solve',
    type: 'matrixLab',
    mode: 'solve',
    equations: ['x - 4y + 3z = -7', '2x + 3y - 5z = 19', '4x + y - z = 17'],
    prompt: 'Solve the system.',
  },
  balance: {
    questionId: 'wv-help-balance',
    type: 'stepAlgebra2',
    equation: { a: 2, b: 3, c: 11 },
    prompt: 'Solve for x.',
  },
  // Mixed step lists (W6-4, item 1): each splits into control steps an
  // assessment keeps and method steps it withholds.
  table: {
    questionId: 'wv-help-table',
    type: 'linearTableWorkbench',
    mode: 'deriveEquation',
    rows: [{ x: -2, y: 5.5 }, { x: 1, y: 4.75 }, { x: 4, y: 4 }, { x: 7, y: 3.25 }],
    requiredComparisons: 3,
    prompt: 'Decide whether the table is linear, and write its equation if it is.',
  },
  rewrite: {
    questionId: 'wv-help-rewrite',
    type: 'stepAlgebra2',
    mode: 'rewriteLinearForm',
    targetForm: 'slopeIntercept',
    equation: '2x - 4y = 8',
    prompt: 'Rewrite 2x − 4y = 8 in slope-intercept form.',
  },
  intercepts: {
    questionId: 'wv-help-intercepts',
    type: 'stepAlgebra2',
    mode: 'linearIntercepts',
    standard: { A: 2, B: 3, C: 12 },
    prompt: 'Find the x- and y-intercepts of 2x + 3y = 12.',
  },
  constraint: {
    questionId: 'wv-help-constraint',
    type: 'constraintFunctionBuilder',
    allowedFamilies: ['linear', 'quadratic'],
    constraints: [
      { id: 'family', kind: 'family', value: 'linear', label: 'Linear function' },
      { id: 'behavior', kind: 'behavior', value: 'increasing', label: 'Increasing' },
    ],
    prompt: 'Build an increasing linear function.',
  },
  regression: {
    questionId: 'wv-help-regression',
    type: 'dataModelingLab',
    mode: 'linearFitPrediction',
    points: [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]],
    predictionX: 9,
    prompt: 'Write a linear model for the data and predict y when x = 9.',
  },
  bridge: {
    questionId: 'wv-help-bridge',
    type: 'representationBridge',
    mode: 'linear',
    source: { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] },
    context: {
      inputLabel: 'items sold', outputLabel: 'profit', inputUnit: 'items', outputUnit: 'dollars',
      rateUnit: 'dollars per item', rateMeaning: 'profit earned for each item sold',
      yInterceptMeaning: 'starting profit after paying the booth fee',
      zeroMeaning: 'number of items that must be sold to break even',
    },
    requiredStages: ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning'],
    requiredComparisons: 3,
    graphBounds: { xMin: -2, xMax: 8, yMin: -25, yMax: 15 },
    prompt: 'Connect the table to every representation of the profit.',
  },
  match: {
    questionId: 'wv-help-match',
    type: 'representationMatch',
    mode: 'linearConnections',
    task: 'group',
    cardKinds: ['context', 'slopeIntercept', 'slope', 'table'],
    sets: [
      { id: 'plan', context: 'A phone plan costs $10 a month plus $2 for each gigabyte used.', slopeIntercept: 'y = 2x + 10', slope: 2, table: [{ x: 0, y: 10 }, { x: 1, y: 12 }, { x: 2, y: 14 }] },
      { id: 'candle', context: 'A 20 cm candle burns down 3 cm every hour.', slopeIntercept: 'y = -3x + 20', slope: -3, table: [{ x: 0, y: 20 }, { x: 1, y: 17 }, { x: 2, y: 14 }] },
    ],
    prompt: 'Sort every card into the situation it describes.',
  },
  graphing: {
    questionId: 'wv-help-graphing',
    type: 'graphing2',
    mode: 'slopeIntercept',
    prompt: 'Graph the line y = 2x + 1.',
    line: { m: 2, b: 1 },
  },
};

window.__mmAsked = [];

function Harness() {
  const [requested, setRequested] = useState(false);
  return (
    <div style={{ padding: 8, fontFamily: 'system-ui' }}>
      <QuestionEngine
        question={QUESTIONS[tool]}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        maximumAttempts={role === 'practice' ? 3 : 1}
        activityRole={role}
        draftKey={`wv-help-reach-${role}-${tool}-${params.get('run') || 'a'}`}
        onAskTeacher={(next) => { window.__mmAsked.push(next); setRequested(next); }}
        helpRequested={requested}
        askTeacherContext={{ mode: 'hand' }}
        serverGrading={params.get('grading') === 'server' ? { pathToolId: QUESTIONS[tool].type, submit: async () => null } : null}
        onGrade={async (isCorrect) => ({ isCorrect, status: isCorrect ? 'correct' : 'expired', attemptCount: 1, remainingAttempts: 0 })}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
