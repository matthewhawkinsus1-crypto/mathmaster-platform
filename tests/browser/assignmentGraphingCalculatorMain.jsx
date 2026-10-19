// ONE QUESTION ON AN ORDINARY ASSIGNMENT, WITH THE ASSIGNMENT'S CALCULATOR
// SETTING (pass 3, PR-25 / PR-26), mounted through the real QuestionEngine the
// way App.jsx mounts a student's question. Driven by
// tests/browser/assignmentGraphingCalculator.mjs.
//
//   ?calc=<mode>        the assignment's toolPolicy.calculator (default graphing;
//                       'off' passes nothing, as an assignment with no setting)
//   ?role=<role>        the activity role (default classwork)
//   ?mode=<mode>        the question's own authored calculatorMode (rawSpec)
//   ?ctx=sat            an assessment context (a secure SAT item's)
//   ?tool=<toolId>      a registry tool from SAMPLE_SPECS instead of the
//                       quadratic question (graphing2 has Work View)
//   ?released=1         this question's own feedback is released, as App.jsx
//                       does for a closed (correct or out-of-tries) DOL question
//                       while the exit ticket is still open
//   ?review=1           the whole assessment's feedback is released
//
// Every graded submission, with the support use it recorded, lands in
// window.__mmGraded.
import React from 'react';
import { MathfieldElement } from 'mathlive';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const calc = params.get('calc') || 'graphing';
const role = params.get('role') || 'classwork';
const questionMode = params.get('mode');
const toolId = params.get('tool');

const question = toolId
  ? { id: `gc-${toolId}`, questionId: `gc-${toolId}`, type: toolId, prompt: `Complete the ${toolId} activity.`, ...SAMPLE_SPECS[toolId] }
  : {
    questionId: 'assignment-graphing-calculator',
    type: 'multiAnswer',
    prompt: 'Enter f(x) = x^2 - 4 into the built-in graphing calculator. What is the positive zero of f?',
    answerFields: [{ id: 'zero', label: 'Positive zero', answer: '2', inputProfile: 'text' }],
    ...(questionMode ? { rawSpec: { calculatorMode: questionMode } } : {}),
  };

window.__mmGraded = [];

function Harness() {
  return (
    <div className="app-container mathmaster-assignment-screen" data-gc-calc={calc} data-gc-role={role}>
      <main className="mathmaster-question-stage">
        <QuestionEngine
          question={question}
          questionRecord={{ status: 'unattempted', attemptCount: 0 }}
          generationKey={`gc|${calc}|${role}|${questionMode || ''}|${toolId || ''}`}
          activityRole={role}
          maximumAttempts={role === 'classwork' ? 3 : 1}
          assignmentId="assignment-graphing-calculator"
          assignmentCalculatorMode={calc === 'off' ? null : calc}
          assessmentContext={params.get('ctx') || null}
          feedbackReleased={params.get('released') === '1'}
          assessmentReviewReleased={params.get('review') === '1'}
          executionScope="student"
          studentProfile={{}}
          onGrade={async (isCorrect, details, parts, supportUsage) => {
            window.__mmGraded.push({ isCorrect, supportUsage: JSON.parse(JSON.stringify(supportUsage ?? null)) });
            return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 0 };
          }}
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
