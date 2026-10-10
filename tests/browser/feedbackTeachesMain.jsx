// The classroom feedback ladder, mounted in the real QuestionEngine the way
// App.jsx mounts a student's question. Driven by tests/browser/feedbackTeaches.mjs.
//
//   ?role=practice|dol      the activity policy
//   ?q=multi|family|system  the fixture
//   ?support=translate      give the student Read aloud + Translate (Spanish)
//   ?run=<id>               a fresh draft namespace
//   ?secure=1               mount it the way a secure Test item is mounted:
//                           server-graded (RichQuestionRuntime), and still
//                           handed an onAskTeacher callback
//
// Graded submissions land on window.__mmGrades, "Ask my teacher" toggles on
// window.__mmHelp.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { emptyQuestionRecord, recordQuestionAttempt } from '../../src/attemptPolicy.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const which = params.get('q') || 'multi';
const run = params.get('run') || 'manual';
const policy = getEffectiveActivityPolicy(role);
const maximumAttempts = policy.attempts;
const assignmentId = `feedback-teaches-${which}`;

const QUESTIONS = {
  multi: {
    questionId: 'feedback-multi',
    type: 'multiAnswer',
    prompt: 'A line passes through (1, 2) and (5, 5). Find its slope.',
    answerFields: [{ id: 'slope', label: 'Slope', answer: '3/4', inputProfile: 'text' }],
    supportHints: ['Slope is the change in y divided by the change in x between the two points.', 'Subtract the coordinates in the same order: second point minus first point, on the top and on the bottom.'],
    solutionReview: {
      headline: 'Slope compares the change in y with the change in x.',
      reasoning: ['Change in y: 5 − 2 = 3.', 'Change in x: 5 − 1 = 4.', 'Slope = 3/4.'],
      answerSummary: 'The slope is 3/4.',
    },
  },
  family: {
    questionId: 'feedback-family',
    type: 'multiAnswer',
    activityRole: 'classwork',
    questionFamily: { id: 'linear.twoStepEquation', version: 1, tool: 'multiAnswer' },
  },
  system: {
    questionId: 'feedback-system',
    type: 'system',
    prompt: 'Solve the system: y = x + 1 and y = -x + 5.',
    equations: ['y = x + 1', 'y = -x + 5'],
    solution: [2, 3],
  },
};
const question = QUESTIONS[which];
const studentProfile = params.get('support') === 'translate'
  ? { accommodations: ['text-to-speech', 'translation'], translationLanguage: 'es' }
  : {};

window.__mmGrades = [];
window.__mmHelp = [];

const serverGrading = params.get('secure') === '1' ? {
  pathToolId: null,
  submit: async () => {
    window.__mmGrades.push({ server: true });
    return { isCorrect: false, status: 'attempted', attemptCount: 1, remainingAttempts: 0, message: 'Your answer is recorded.' };
  },
} : null;

function Harness() {
  const [record, setRecord] = useState(emptyQuestionRecord());
  const [help, setHelp] = useState(false);
  const onGrade = async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
    window.__mmGrades.push({ isCorrect, parts, supportUsage, responseKey });
    const outcome = recordQuestionAttempt({ record, isCorrect, questionDetails: details, parts, supportUsage, responseKey, partialCreditPercent: meta?.partialCreditPercent, maximumAttempts });
    setRecord(outcome.record);
    return outcome.result;
  };
  return (
    <div className="mathmaster-assignment-screen" data-feedback-fixture={which} data-feedback-role={role} style={{ fontFamily: '"Segoe UI", sans-serif', minHeight: '100vh', padding: 12 }}>
      <main className="mathmaster-question-stage" style={{ maxWidth: 1120, margin: '0 auto', background: 'var(--mm-surface)', borderRadius: 12, padding: 10 }}>
        <QuestionEngine
          question={question}
          questionRecord={record}
          maximumAttempts={maximumAttempts}
          activityRole={role}
          dolMode={role === 'dol'}
          generationKey={`${assignmentId}|student-a|0|variant:0`}
          familyContext={which === 'family' ? { assignmentId, storageIndex: 0, variant: 0, allocation: { seat: 3, variant: 0, stride: 40, index: 3, basis: 'seated' } } : null}
          draftKey={`feedback-teaches-${role}-${which}-${run}`}
          assignmentId={assignmentId}
          executionScope="student"
          studentProfile={studentProfile}
          onGrade={onGrade}
          serverGrading={serverGrading}
          // The delivered family instance's own prompt, as plain text: the page
          // text also carries each formula's spoken form.
          onFamilyDelivery={(delivery, delivered) => { window.__mmFamilyPrompt = String(delivered?.prompt || ''); }}
          onAskTeacher={(requested) => { window.__mmHelp.push(requested); setHelp(requested); }}
          helpRequested={help}
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
