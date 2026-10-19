// THE PHONE WORK BAR'S PRIMARY ACTION, AT ITS FULLEST.
//
// One ordinary question in the real QuestionEngine with every tool the bar
// can carry: Undo, Reset, Scratchpad, Calculator, Hint (practice, so hints are
// allowed) and Read aloud (a text-to-speech accommodation, offered where the
// browser can speak). App.jsx's onNextQuestion and onContinueSection are
// passed, so a finished question's bar carries "Next question →" — or, at the
// end of a section, "Continue to Unit 2 Review →" — where Submit was.
//
//   ?state=submit    an open question: Submit (default)
//   ?state=next      the question already answered correctly: Next question
//   ?state=section   ... and its section complete: Continue to the next one
//
// Driven by tests/browser/workBarPrimaryLabel.mjs.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { emptyQuestionRecord, recordQuestionAttempt } from '../../src/attemptPolicy.js';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const question = { id: 'work-bar-primary', type: 'literal', prompt: 'What is 3 + 4?', correctAnswer: '7' };
const maximumAttempts = 3;
const state = params.get('state') || 'submit';
// A correct attempt on the record closes the question, the way App.jsx's
// record does after the server's verdict.
const startRecord = state === 'submit'
  ? emptyQuestionRecord()
  : recordQuestionAttempt({ record: emptyQuestionRecord(), isCorrect: true, responseKey: '{"value":"7"}', maximumAttempts }).record;
window.__mmNext = 0;

function Harness() {
  const [record, setRecord] = useState(startRecord);
  const onGrade = async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
    const outcome = recordQuestionAttempt({ record, isCorrect, questionDetails: details, parts, supportUsage, responseKey, partialCreditPercent: meta?.partialCreditPercent, maximumAttempts });
    setRecord(outcome.record);
    return outcome.result;
  };
  return (
    <div className="mathmaster-assignment-screen" style={{ minHeight: '100vh' }}>
      <main className="mathmaster-question-stage">
        <QuestionEngine
          question={question}
          questionRecord={record}
          maximumAttempts={maximumAttempts}
          activityRole="practice"
          studentProfile={{ accommodations: ['text-to-speech'] }}
          draftKey={`work-bar-primary-${params.get('run') || 'a'}`}
          executionScope="student"
          onGrade={onGrade}
          sectionComplete={state === 'section'}
          sectionLabel="Practice"
          sectionQuestionCount={1}
          continueSectionLabel="Unit 2 Review"
          onNextQuestion={() => { window.__mmNext += 1; }}
          onContinueSection={() => { window.__mmNext += 1; }}
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
