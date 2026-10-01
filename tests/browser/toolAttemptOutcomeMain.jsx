// One question in the real QuestionEngine, inside App.jsx's assignment
// wrappers and under the real signed-in StudentIdentityBar, with a question
// record that behaves like App.jsx's: onGrade applies recordQuestionAttempt and
// feeds the new record back, so the tries left really go down (the
// studentUxPlatform harness passes `questionRecord={null}`, so its count never
// moves). Driven by tests/browser/toolAttemptOutcome.mjs.
//
//   ?role=practice|dol|quiz|test   the activity policy (default practice)
//   ?tool=inverse         Inverse & Composition (restriction), a ResultPill verdict
//   ?tool=investigation   Function Investigation (domain and range), a ResultPill verdict
//   ?tool=regression      Regression Calculator, whose verdict is its own live region
//   ?tool=board           the Linear Multiple Representations board, whose
//                         Submit verdict is its own live region
//   ?tool=server          Inverse & Composition, server-graded (Path): the tool
//                         shows no verdict of its own, so the engine's box stays
//   ?tool=literal         an ordinary typed question, not a tool: the engine's box
//   ?prior=N              N earlier wrong attempts already on the record, as on
//                         a question the student comes back to another day
//
// What reached onGrade lands in window.__mmGrades.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import StudentIdentityBar from '../../src/components/student/StudentIdentityBar.jsx';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';
import { emptyQuestionRecord, recordQuestionAttempt } from '../../src/attemptPolicy.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const tool = params.get('tool') || 'inverse';
const prior = Math.max(0, Number(params.get('prior')) || 0);
const policy = getEffectiveActivityPolicy(role);
const maximumAttempts = policy.attempts;

const QUESTIONS = {
  inverse: { id: 'attempt-outcome-inverse', type: 'inverseCompositionLab', prompt: 'Restrict the domain so f has an inverse, then undo it.', ...SAMPLE_SPECS.inverseCompositionLab },
  investigation: { id: 'attempt-outcome-investigation', type: 'functionInvestigation2', prompt: 'Give the domain and range of this function.', ...SAMPLE_SPECS.functionInvestigation2 },
  regression: { id: 'attempt-outcome-regression', type: 'regressionCalculator', ...SAMPLE_SPECS.regressionCalculator },
  board: {
    id: 'attempt-outcome-board',
    type: 'representationBridge',
    mode: 'linearMultipleRepresentations',
    studentActions: ['connectLinearRepresentations'],
    prompt: 'You are given a slope-intercept equation. Build the other representations.',
    source: { kind: 'slopeIntercept', m: -0.75, b: 2 },
    feedbackTiming: 'guided',
  },
  server: { id: 'attempt-outcome-server', type: 'inverseCompositionLab', prompt: 'Restrict the domain so f has an inverse, then undo it.', ...SAMPLE_SPECS.inverseCompositionLab },
  literal: { id: 'attempt-outcome-literal', type: 'literal', prompt: 'What is 3 + 4?', correctAnswer: '7' },
};
const question = QUESTIONS[tool];

// A question the student has been to before: wrong attempts on the record,
// the last response key included.
let startRecord = emptyQuestionRecord();
for (let index = 0; index < prior; index += 1) {
  startRecord = recordQuestionAttempt({ record: startRecord, isCorrect: false, responseKey: `{"earlier":${index}}`, maximumAttempts }).record;
}

window.__mmGrades = [];

// Server grading the way the Path does it: the tool sends its raw work and the
// verdict comes back from the "server".
const serverGrading = tool === 'server' ? {
  pathToolId: 'inverseCompositionLab',
  submit: async () => {
    window.__mmGrades.push({ server: true });
    return { isCorrect: false, status: 'attempted', attemptCount: 1, remainingAttempts: maximumAttempts - 1 };
  },
} : null;

function Harness() {
  const [record, setRecord] = useState(startRecord);
  const onGrade = async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
    window.__mmGrades.push({ isCorrect, responseKey, partialCreditPercent: meta?.partialCreditPercent ?? null });
    const outcome = recordQuestionAttempt({ record, isCorrect, questionDetails: details, parts, supportUsage, responseKey, partialCreditPercent: meta?.partialCreditPercent, maximumAttempts });
    setRecord(outcome.record);
    return outcome.result;
  };
  return (
    <div data-authenticated-student-shell="student" style={{ minHeight: '100vh' }}>
      <StudentIdentityBar student={{ firstName: 'Claude', lastName: 'QA Student', classPeriod: '3' }} classPointsBalance={120} onLogout={() => {}} />
      <div className="mathmaster-assignment-screen" style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh', padding: 20 }}>
        <div className="mathmaster-assignment-shell" style={{ maxWidth: 1120, margin: '0 auto' }}>
          {/* The navigator's class and measured height, as App.jsx renders it:
              on a phone the shell is a two-row grid (navigator, then the
              question filling the rest), and the sticky task starts below it. */}
          <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className="mathmaster-assignment-unified-nav" aria-label="Assignment questions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {['PR 1', 'PR 2', 'PR 3', 'PR 4'].map((label, index) => (
              <button key={label} type="button" aria-current={index === 1 ? 'step' : undefined} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #b8cdf0', background: index === 1 ? '#174ea6' : '#fff', color: index === 1 ? '#fff' : '#174ea6', fontWeight: 800, fontSize: 12 }}>{label}</button>
            ))}
          </nav>
          <main className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: 12, padding: 10, minHeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <QuestionEngine
              question={question}
              questionRecord={record}
              maximumAttempts={maximumAttempts}
              activityRole={role}
              dolMode={role === 'dol'}
              serverGrading={serverGrading}
              draftKey={`attempt-outcome-${role}-${tool}-${params.get('run') || 'a'}`}
              executionScope="student"
              onGrade={onGrade}
            />
          </main>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
