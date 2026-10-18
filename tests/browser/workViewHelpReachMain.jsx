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
