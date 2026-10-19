// One question in the real QuestionEngine, inside App.jsx's assignment
// wrappers, for the wave-7 feedback messages. Driven by
// tests/browser/feedbackReasons2.mjs.
//
//   ?role=practice|dol|quiz|test   the activity policy (default practice)
//   ?case=<name>                   one of CASES below
//
// The record behaves like App.jsx's (recordQuestionAttempt), as in the
// toolAttemptOutcome harness.
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
const which = params.get('case') || 'regression';
const policy = getEffectiveActivityPolicy(role);

const CASES = {
  regression: { id: 'fr2-regression', type: 'regressionCalculator', ...SAMPLE_SPECS.regressionCalculator },
  functionOperations: {
    id: 'fr2-function-operations', type: 'functionOperationsLab', prompt: 'Find each combination of f and g.',
    f: { type: 'linear', a: 2, h: 0, k: 1 }, g: { type: 'linear', a: 1, h: 2, k: 0 }, operations: ['sum', 'difference'],
  },
  match: {
    id: 'fr2-match', type: 'representationMatch', mode: 'linearConnections', task: 'findMismatch',
    prompt: 'One card does not describe the same line as the others. Find it and correct it.',
    sets: [{ id: 'm', slopeIntercept: 'y=-2x+5', factoredLinear: 'y=-2(x-2.5)', pointSlope: 'y-1=-2(x+2)', standard: '2x+y=5' }],
    mismatchSetId: 'm',
    correctionOptions: [{ id: 'minus', label: 'y-1=-2(x-2)' }, { id: 'plus', label: 'y+1=-2(x+2)' }],
    correctionAnswerId: 'minus',
  },
  dataModeling: {
    id: 'fr2-data-modeling', type: 'dataModelingLab', mode: 'association', prompt: 'Describe the association.',
    points: [[1, 3.1], [2, 4.9], [3, 7.2], [4, 8.8], [5, 11.1], [6, 13]], causationSupported: false,
  },
  bridge: { id: 'fr2-bridge', type: 'representationBridge', prompt: 'Build every representation of the booth fee.', ...SAMPLE_SPECS.representationBridge, feedbackTiming: 'submitOnly' },
  transformations: { id: 'fr2-transformations', type: 'transformationsLab', ...SAMPLE_SPECS.transformationsLab, mode: 'match', prompt: 'Match the transformed graph.' },
  composed: {
    id: 'fr2-composed', type: 'relationMapping', prompt: 'The relation {(1, 2), (2, 4), (3, 6)}.',
    recipe: { name: 'relationRepresentations', ask: ['mapping', 'domain'] }, pairs: [[1, 2], [2, 4], [3, 6]],
  },
};
const question = CASES[which];
window.__mmGrades = [];

function Harness() {
  const [record, setRecord] = useState(emptyQuestionRecord());
  const onGrade = async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
    window.__mmGrades.push({ isCorrect, parts, responseKey });
    const outcome = recordQuestionAttempt({ record, isCorrect, questionDetails: details, parts, supportUsage, responseKey, partialCreditPercent: meta?.partialCreditPercent, maximumAttempts: policy.attempts });
    setRecord(outcome.record);
    return outcome.result;
  };
  return (
    <div data-authenticated-student-shell="student" style={{ minHeight: '100vh' }}>
      <StudentIdentityBar student={{ firstName: 'Claude', lastName: 'QA Student', classPeriod: '3' }} classPointsBalance={120} onLogout={() => {}} />
      <div className="mathmaster-assignment-screen" style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh', padding: 20 }}>
        <div className="mathmaster-assignment-shell" style={{ maxWidth: 1120, margin: '0 auto' }}>
          <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className="mathmaster-assignment-unified-nav" aria-label="Assignment questions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {['PR 1', 'PR 2'].map((label, index) => (
              <button key={label} type="button" aria-current={index === 0 ? 'step' : undefined} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #b8cdf0', background: index === 0 ? '#174ea6' : '#fff', color: index === 0 ? '#fff' : '#174ea6', fontWeight: 800, fontSize: 12 }}>{label}</button>
            ))}
          </nav>
          <main className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: 12, padding: 10, minHeight: 500 }}>
            <QuestionEngine
              question={question}
              questionRecord={record}
              maximumAttempts={policy.attempts}
              activityRole={role}
              dolMode={role === 'dol'}
              draftKey={`fr2-${role}-${which}-${params.get('run') || 'a'}`}
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
