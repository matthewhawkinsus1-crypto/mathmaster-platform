/*
 * The typed-field surfaces, each as a student meets it, for
 * tests/browser/typedEntryRefusal.mjs (#557, #558): an entry left unfinished
 * (`12 +`) or longer than an answer may be cannot be submitted, the box says
 * why, and nothing is recorded.
 *
 *   ?surface=engine        QuestionEngine, a one-box multiAnswer question (key 12)
 *   ?surface=literal       QuestionEngine, a literal equation
 *   ?surface=path          PathSessionPlayer's own renderer, one number box
 *   ?surface=corrections   RichQuestionRuntime as Test Cycle Corrections (3 tries)
 *   ?surface=secure        RichQuestionRuntime as a secure test in navigation
 *                          mode: no per-question Submit, drafts autosave
 *   ?run=…                 a fresh local draft
 *
 * What a surface submits lands in window.__mmSubmits, and a secure draft in
 * window.__mmDrafts.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import PathSessionPlayer from '../../src/components/student/PathSessionPlayer.jsx';
import RichQuestionRuntime from '../../src/components/question/RichQuestionRuntime.jsx';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const SURFACE = params.get('surface') || 'engine';
const run = params.get('run') || 'a';
window.__mmSubmits = [];
window.__mmDrafts = [];

const ENGINE_QUESTIONS = {
  engine: { questionId: 'typed-entry-multi', type: 'multiAnswer', prompt: 'Evaluate $3 \\cdot 4$.', answerFields: [{ id: 'value', label: 'Value', answer: '12', inputProfile: 'number' }] },
  literal: { questionId: 'typed-entry-literal', type: 'literal', prompt: 'Solve $A = lw$ for $w$.', formula: 'A = lw', solveFor: 'w', acceptedAnswers: ['w = A/l', 'A/l'] },
};

function Engine() {
  return (
    <QuestionEngine
      question={ENGINE_QUESTIONS[SURFACE]}
      generationKey={`typed-entry|${SURFACE}|0|variant:0`}
      questionRecord={{ status: 'unattempted', attemptCount: 0 }}
      maximumAttempts={3}
      activityRole="practice"
      draftKey={`typed-entry-${SURFACE}-${run}`}
      onGrade={async (isCorrect, details, parts, supportUsage, responseKey) => {
        window.__mmSubmits.push({ isCorrect, responseKey });
        return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
      }}
    />
  );
}

function Path() {
  const questionInstance = {
    questionInstanceId: `typed-entry-path-${run}`, questionType: 'response', prompt: 'Evaluate $3 \\cdot 4$.',
    responseFields: [{ id: 'answer', label: 'Value', inputProfile: 'number' }],
    attemptsAllowed: 3, attemptsUsed: 0, applicableSupports: [], teksCode: 'A.5A',
  };
  return (
    <PathSessionPlayer
      session={{ sessionId: 'typed-entry-session', status: 'active', sessionKind: 'practice', requiredQuestions: 5, summary: { completedQuestions: 1 }, target: { alignmentKey: 'texas:A.5A' } }}
      questionInstance={questionInstance}
      lastGradingResult={null}
      isSubmitting={false}
      studentProfile={{}}
      onSubmitAnswer={async (payload) => { window.__mmSubmits.push(payload); return null; }}
    />
  );
}

function Rich() {
  const secure = SURFACE === 'secure';
  const question = {
    questionInstanceId: `typed-entry-${SURFACE}-${run}`, runtimeMode: secure ? 'secureTest' : 'corrections', prompt: 'Evaluate $3 \\cdot 4$.',
    responseFields: [{ id: 'answer', label: 'Value', inputProfile: 'number' }], attemptsAllowed: 3,
  };
  return (
    <RichQuestionRuntime
      question={question}
      mode={secure ? 'secureTest' : 'corrections'}
      navigationMode={secure}
      attempt={secure ? null : { used: 0, allowed: 3 }}
      onSubmit={async (payload) => { window.__mmSubmits.push(payload); return null; }}
      onDraftChange={(payload) => { window.__mmDrafts.push(payload); }}
    />
  );
}

const SURFACES = { engine: Engine, literal: Engine, path: Path, corrections: Rich, secure: Rich };
const Surface = SURFACES[SURFACE] || Engine;
createRoot(document.getElementById('root')).render(<div data-typed-entry-surface={SURFACE} style={{ padding: 16 }}><Surface /></div>);
