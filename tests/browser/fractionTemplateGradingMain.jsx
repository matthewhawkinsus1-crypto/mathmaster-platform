// A "Simplify" fraction question whose key is drawn from a template, in the
// real QuestionEngine and MathLive. Driven by
// tests/browser/fractionTemplateGrading.mjs.
//
//   ?kind=family|template|authored   how its key is made (see the fixture)
//   ?seat=N                          which student's version
//   ?run=…                           a fresh local draft
//
// What the engine submits lands in window.__mmGraded.
import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/index.css';
import { familyContextFor, generationKeyFor, questionFor } from './fractionTemplateGradingFixture.mjs';

const params = new URLSearchParams(window.location.search);
const kind = params.get('kind') || 'family';
const seat = Number(params.get('seat') || 0);
const run = params.get('run') || 'a';
const question = questionFor(kind);
const familyContext = familyContextFor(kind);

window.__mmGraded = null;

function Harness() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <QuestionEngine
        question={question}
        generationKey={generationKeyFor(seat)}
        familyContext={familyContext}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        maximumAttempts={3}
        activityRole="practice"
        draftKey={`fraction-template-${kind}-${seat}-${run}`}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey) => {
          window.__mmGraded = { isCorrect, parts, responseKey };
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
