import React from 'react';
import { MathfieldElement } from 'mathlive';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import '../../src/index.css';
import '../../src/App.css';

// Harness for tests/browser/sequenceBuildScreen.mjs: the "Build the Sequence
// Model" screen (Sequence Explorer, mode fullBridge) in the real QuestionEngine,
// as a student meets the DOL #3 Review's question 13 (a table of six terms to
// fill, a plane to plot them on, the pattern to name).
//
//   ?role=practice|dol   the activity policy (default practice)
//   ?extra={...}         JSON merged over the question (displayCount, notation, ...)
//   ?run=<anything>      a fresh draft each time
MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const extra = params.get('extra') ? JSON.parse(params.get('extra')) : {};
const question = {
  type: 'sequenceExplorer', mode: 'fullBridge', sequence: { kind: 'arithmetic', first: -7, difference: 4 }, displayCount: 6,
  prompt: 'A sequence is given in function form by f(1) = −7 and f(n) = f(n − 1) + 4 for n ≥ 2. In the tool, the nth term f(n) is written aₙ. Use the recursive rule to find the first six terms, plot them, and identify the common difference.',
  activityRole: role, dok: 2, difficultyBand: 3,
  solutionReview: { commonError: 'Adding 4 to the position n instead of to the term before it; each term is the previous term plus 4, so the terms are −7, −3, 1, 5, 9, 13.' },
  hints: ['A recursive rule tells you how to get each term from the term just before it.'],
  studentActions: ['buildSequenceTable', 'plotSequence', 'analyzeSequence'],
  questionId: 'dol3-review-q13', questionWeight: 1, standard: 'A.12C',
  ...extra,
};
window.__mmGraded = [];
const assignmentId = `sequence-build-${role}`;
const draftKey = buildQuestionDraftKey({ studentId: 'sequence-build-student', assignmentId, questionIndex: 0, variantIndex: 0, sessionMode: 'graded' });

createRoot(document.getElementById('root')).render(
  <main className="mathmaster-question-stage" style={{ maxWidth: 1120, width: '100%', margin: '0 auto', padding: 10, boxSizing: 'border-box', background: 'var(--mm-surface)' }} data-sequence-build={role}>
    <QuestionEngine
      key={`${role}-${params.get('run') || ''}`}
      question={question}
      questionRecord={{ status: 'unattempted', attemptCount: 0 }}
      generationKey={`${assignmentId}|0`}
      activityRole={role}
      dolMode={role === 'dol'}
      maximumAttempts={3}
      draftKey={draftKey}
      assignmentId={assignmentId}
      executionScope="student"
      studentProfile={{}}
      onStepGrade={() => null}
      onGrade={async (isCorrect, details, parts) => {
        window.__mmGraded.push({ isCorrect, details, parts });
        return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
      }}
    />
  </main>,
);
