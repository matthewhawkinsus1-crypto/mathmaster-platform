// A DOL question as App.jsx's assignment screen mounts it, with the lines App
// renders under the engine, all decided by describeDolClose. Driven by
// tests/browser/dolCloseCopy.mjs.
//
//   ?status=active|ended        getDOLState().status
//   ?teacher=1                  getDOLState().teacherClosed ("Close now")
//   ?outcome=<receipt status>   auto-submitted | explicitly-submitted | incomplete-at-close
//   ?copy=legacy                the pre-fix App.jsx copy (the R2-m4 defect),
//                               so the browser proof can show it fails on it
//   ?run=<id>                   a fresh draft namespace
import React from 'react';
import { MathfieldElement } from 'mathlive';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { describeDolClose } from '../../src/platform/assessment/dolCloseCopy.js';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const status = params.get('status') || 'ended';
const teacherClosed = params.get('teacher') === '1';
const outcome = params.get('outcome') || null;
const legacy = params.get('copy') === 'legacy';
const run = params.get('run') || 'manual';

const question = {
  questionId: 'dol-close-copy-slope',
  type: 'multiAnswer',
  prompt: 'A line passes through (1, 2) and (5, 5). Find its slope.',
  answerFields: [{ id: 'slope', label: 'Slope', answer: '3/4', inputProfile: 'text' }],
  attemptFeedback: ['DOLCOPY-LEAK-FEEDBACK: check the order of subtraction.'],
  solutionReview: { headline: 'DOLCOPY-LEAK-REVIEW', reasoning: ['DOLCOPY-LEAK-REVIEW: change in y is 3.'], answerSummary: 'DOLCOPY-LEAK-REVIEW: the slope is 3/4.' },
};

// The copy App.jsx rendered before the fix: the lock message on any ended DOL,
// and the "when time ends" line whenever no receipt had arrived.
const legacyCopy = () => ({
  lockMessage: status === 'ended' ? 'The DOL timer has ended. Your saved response is available for review, but no new submission is allowed.' : '',
  openNotice: !outcome || status === 'active' ? 'Your latest completed response will be submitted automatically when time ends.' : '',
  closeReceipt: outcome && status !== 'active' ? 'Time ended. Your latest completed response was submitted automatically.' : '',
});

const copy = legacy ? legacyCopy() : describeDolClose({ status, teacherClosed, outcome });
const assignmentId = `dol-close-copy-${run}`;
const draftKey = buildQuestionDraftKey({ studentId: 'dol-close-copy-student', assignmentId, questionIndex: 0, variantIndex: 0, sessionMode: 'graded' });
window.__mmGraded = [];
window.__mmCopy = copy;

function Harness() {
  return (
    <main className="mathmaster-question-stage" data-dol-copy-ready="1" style={{ maxWidth: 1360, margin: '0 auto', padding: 10, fontFamily: 'system-ui' }}>
      <QuestionEngine
        key={`${status}-${teacherClosed}-${outcome}-${run}`}
        question={question}
        questionRecord={{ status: 'attempted', attemptCount: 1 }}
        generationKey={`${assignmentId}|slope`}
        activityRole="dol"
        dolMode={status === 'active'}
        assignmentLocked={status === 'ended'}
        assignmentLockedMessage={copy.lockMessage}
        maximumAttempts={1}
        draftKey={draftKey}
        assignmentId={assignmentId}
        executionScope="student"
        studentProfile={{}}
        onGrade={async (isCorrect) => { window.__mmGraded.push({ isCorrect }); return { isCorrect, status: 'attempted', attemptCount: 2, remainingAttempts: 0 }; }}
      />
      {copy.openNotice && <p data-dol-line="open-notice" style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 12 }}>{copy.openNotice}</p>}
      {copy.closeReceipt && <p data-dol-line="close-receipt" role="status" aria-live="polite" style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 12 }}>{copy.closeReceipt}</p>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
