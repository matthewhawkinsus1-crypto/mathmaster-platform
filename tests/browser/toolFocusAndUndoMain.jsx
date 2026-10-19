// One registry tool in the real QuestionEngine, so the work-bar Undo the
// student presses is the real one, and its drafts are the real drafts. Driven
// by tests/browser/toolFocusAndUndo.mjs.
//
//   ?tool=<toolId>            any registry tool id (its MathToolsLab sample spec)
//   ?spec=<url-encoded JSON>  merged over the sample spec
//   ?run=<id>                 the draft key: the same run after a reload is the
//                             same student coming back to the same question
//   ?swap=1                   My Math Path's way: ONE QuestionEngine, no key,
//                             whose question and draft key move on in place
//                             (PathSessionPlayer.jsx); window.__nextQuestion()
//                             goes to item 2, window.__previousQuestion() back
//
// Every grade the engine asks for is counted in window.__GRADES__, so the
// driver can prove an Undo never makes or changes an attempt.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const toolId = params.get('tool') || 'openSortBoard';
let override = {};
try { override = params.get('spec') ? JSON.parse(params.get('spec')) : {}; } catch { override = {}; }
const question = {
  questionId: `focus-undo-${toolId}`,
  type: toolId,
  prompt: `Complete the ${toolId} activity.`,
  ...SAMPLE_SPECS[toolId],
  ...override,
};

window.__GRADES__ = [];
const run = params.get('run') || 'a';
const onGrade = async (...args) => {
  window.__GRADES__.push({ at: Date.now(), isCorrect: args[0]?.isCorrect ?? null });
  return { isCorrect: false, status: 'attempted', attemptCount: window.__GRADES__.length, remainingAttempts: 3 - window.__GRADES__.length };
};

function Harness() {
  const [item, setItem] = useState(1);
  window.__nextQuestion = () => setItem(2);
  window.__previousQuestion = () => setItem(1);
  const swapping = params.get('swap') === '1';
  const shown = swapping ? { ...question, questionId: `${question.questionId}-item-${item}` } : question;
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }} data-item={item}>
      <QuestionEngine
        question={shown}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        maximumAttempts={3}
        activityRole="practice"
        draftKey={swapping ? `focus-undo-${toolId}-${run}-item-${item}` : `focus-undo-${toolId}-${run}`}
        onGrade={onGrade}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
