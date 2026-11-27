/*
 * SHOW THE STEP ON MY MATH PATH (SP-4b), for tests/browser/showTheStep.mjs.
 * PathSessionPlayer's own renderer, with a Path question whose first part
 * shows a step first, as the server issues it (functions/lib/mathPath.js
 * publicCheckpoint). The server's verdict is played by the harness: the
 * slope is -2, the y-intercept 3.
 *
 *   ?kind=pickPoints|stepMoves   the step (points on the plane, or moves)
 *   ?supports=everyPart          the student's See every part at once support
 *   ?run=…                       a fresh local draft
 *
 * What the student submits lands in window.__mmSubmits.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';
import PathSessionPlayer from '../../src/components/student/PathSessionPlayer.jsx';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const run = params.get('run') || 'a';
const kind = params.get('kind') === 'stepMoves' ? 'stepMoves' : 'pickPoints';
window.__mmSubmits = [];

const QUESTIONS = {
  pickPoints: {
    prompt: 'The line passes through $(0, 3)$ and $(1, 1)$. Enter its slope and its $y$-intercept.',
    responseFields: [
      { id: 'slope', label: 'Slope', inputProfile: 'number', checkpoint: { kind: 'pickPoints', count: 2, of: '(0, 3) and (1, 1)' } },
      { id: 'intercept', label: 'The y-intercept', inputProfile: 'number' },
    ],
    key: { slope: '-2', intercept: '3' },
  },
  stepMoves: {
    prompt: 'Solve $4x + 7 = x - 8$.',
    responseFields: [{ id: 'answer', label: 'The value of x', inputProfile: 'number', checkpoint: { kind: 'stepMoves', of: '4x + 7 = x - 8' } }],
    key: { answer: '-5' },
  },
};
const authored = QUESTIONS[kind];
const studentProfile = params.get('supports') === 'everyPart' ? { accommodations: ['every-part-at-once'] } : {};

function Path() {
  const [result, setResult] = useState(null);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const questionInstance = {
    questionInstanceId: `show-the-step-path-${kind}-${run}`, questionType: 'response', prompt: authored.prompt,
    responseFields: authored.responseFields, attemptsAllowed: 3, attemptsUsed, applicableSupports: [], teksCode: 'A.3B',
  };
  return (
    <PathSessionPlayer
      session={{ sessionId: 'show-the-step-session', status: 'active', sessionKind: 'practice', requiredQuestions: 5, summary: { completedQuestions: 1 }, target: { alignmentKey: 'texas:A.3B' } }}
      questionInstance={questionInstance}
      lastGradingResult={result}
      isSubmitting={false}
      studentProfile={studentProfile}
      onSubmitAnswer={async (payload) => {
        window.__mmSubmits.push(payload);
        const responses = payload?.responses || {};
        const isCorrect = Object.entries(authored.key).every(([id, value]) => String(responses[id] ?? '').trim() === value);
        setAttemptsUsed((used) => used + 1);
        setResult({ isCorrect, attemptsUsed: attemptsUsed + 1 });
        return null;
      }}
    />
  );
}

createRoot(document.getElementById('root')).render(<div data-show-the-step-path={kind} style={{ padding: 16 }}><Path /></div>);
