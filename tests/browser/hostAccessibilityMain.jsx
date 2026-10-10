/*
 * THE QUESTIONENGINE HOSTS THAT ARE NOT THE ASSIGNMENT SCREEN — job H.
 *
 * Real components, synthetic data, nothing reaches Firestore (served by
 * tests/browser/emulator/vite.config.mjs, which stubs src/firebase.js):
 *
 *   ?scene=path-tool&tool=<id>      PathSessionPlayer, a registry tool question
 *                                   (SAMPLE_SPECS) as the Path delivers it
 *   ?scene=path-generic&kind=<k>    PathSessionPlayer's own renderer, a
 *                                   multiple-choice question; k = practice |
 *                                   retentionProbe; &framework=tsia2 for exam
 *                                   practice
 *   ?scene=recap                    MyMathPathSessionRecap with a graph stimulus
 *   ?scene=recovery                 SectionRecoveryRunner, a DOL Recovery
 *                                   assessment of six-field items
 *
 * Driven by tests/browser/hostAccessibility.mjs.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';
import PathSessionPlayer from '../../src/components/student/PathSessionPlayer.jsx';
import MyMathPathSessionRecap from '../../src/components/student/MyMathPathSessionRecap.jsx';
import SectionRecoveryRunner from '../../src/components/student/SectionRecoveryRunner.jsx';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { normalizeDeliveryPin } from '../../functions/shared/questionGenerationIdentity.mjs';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const SCENE = params.get('scene') || 'path-tool';
window.__hostSubmits = [];

const session = {
  sessionId: 'host-session', status: 'active', sessionKind: params.get('kind') || 'practice',
  requiredQuestions: 5, summary: { completedQuestions: 1 }, target: { alignmentKey: 'texas:A.5A' },
  ...(params.get('framework') ? { assessmentFramework: params.get('framework') } : {}),
};

function PathTool() {
  const toolId = params.get('tool') || 'dataModelingLab';
  const canonicalQuestion = { id: `host-${toolId}`, questionId: `host-${toolId}`, type: toolId, prompt: `Complete the ${toolId} activity.`, ...SAMPLE_SPECS[toolId] };
  const questionInstance = {
    questionInstanceId: `host-${toolId}-1`, questionType: toolId, prompt: canonicalQuestion.prompt,
    canonicalQuestion, attemptsAllowed: 3, attemptsUsed: 0, applicableSupports: [], teksCode: 'A.5A',
  };
  return (
    <PathSessionPlayer
      session={session}
      questionInstance={questionInstance}
      lastGradingResult={null}
      isSubmitting={false}
      studentProfile={{}}
      onSubmitAnswer={async (...args) => { window.__hostSubmits.push(args.length); return null; }}
    />
  );
}

function PathGeneric() {
  const questionInstance = {
    questionInstanceId: 'host-generic-1', questionType: 'multipleChoice',
    prompt: 'Which expression is equivalent to $3(x + 4)$?',
    choices: [{ id: 'a', label: '$3x + 4$' }, { id: 'b', label: '$3x + 12$' }, { id: 'c', label: '$x + 12$' }],
    attemptsAllowed: 3, attemptsUsed: 0, applicableSupports: [], teksCode: 'A.10D',
    ...(params.get('role') ? { activityRole: params.get('role') } : {}),
    // &graph=1: the answerable question reads a graph (its description must
    // stay kinds-only while it can be answered).
    ...(params.get('graph') ? { stimulus: { graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, readCoordinates: true, lines: [{ points: [{ x: 0, y: -2 }, { x: 2, y: 2 }] }] } } } : {}),
  };
  return (
    <PathSessionPlayer
      session={session}
      questionInstance={questionInstance}
      lastGradingResult={null}
      isSubmitting={false}
      studentProfile={{}}
      onSubmitAnswer={async () => null}
    />
  );
}

function Recap() {
  const recap = {
    status: 'ready',
    data: {
      items: [{
        questionInstanceId: 'recap-1', questionNumber: 1, outcome: 'incorrect', skillCode: 'A.3C',
        question: {
          prompt: 'Read the graph. Where does the line cross the y-axis?',
          stimulus: { graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, xTickStep: 1, yTickStep: 1, readCoordinates: true, lines: [{ points: [{ x: 0, y: -2 }, { x: 2, y: 2 }] }] } },
        },
        response: { entries: [{ label: 'y-intercept', value: '2' }] },
        correctAnswer: [{ label: 'y-intercept', value: '-2' }],
      }],
    },
  };
  return <MyMathPathSessionRecap recap={recap} />;
}

function Recovery() {
  const ASSIGNMENT_ID = 'host-recovery';
  const fields = ['a', 'b', 'c', 'd', 'e', 'f'];
  const question = (n) => ({
    questionId: `rq${n}`, type: 'multiAnswer', activityRole: 'dol', prompt: `Evaluate each expression for x = {{x}}.`,
    generator: { parameters: { x: { type: 'int', min: 2, max: 9 } }, derived: Object.fromEntries(fields.map((f, i) => [f, `x*${i + 2}`])) },
    answerFields: fields.map((f, i) => ({ id: f, label: `${i + 2}x`, inputProfile: 'number', answer: `{{${f}}}` })),
    questionFamily: { scope: 'assignment' },
  });
  const questions = [question(1), question(2)];
  const pinFor = (q, index) => normalizeDeliveryPin(resolveFamilyQuestionInstance({
    question: q, assignmentId: ASSIGNMENT_ID, storageIndex: index,
    slotKey: `${ASSIGNMENT_ID}|recovery:dol:o1|${q.questionId}`,
    allocation: { seat: index, variant: 0, stride: 1, index, basis: 'provisional' },
  }).delivery);
  const entry = {
    section: 'dol', label: 'DOL Recovery', state: 'in-progress',
    plan: { opportunity: 1, items: questions.map((q, i) => ({ itemId: `item-${i + 1}`, storageIndex: i, questionId: q.questionId, pin: pinFor(q, i) })) },
    questionsByIndex: Object.fromEntries(questions.map((q, i) => [i, q])),
  };
  return (
    <SectionRecoveryRunner
      mode="assessment"
      assignment={{ id: ASSIGNMENT_ID, schemaVersion: 5 }}
      entry={entry}
      studentId="host-student"
      studentProfile={{}}
      onExit={() => {}}
      onRecord={() => {}}
      onStartAssessment={() => {}}
    />
  );
}

const SCENES = { 'path-tool': PathTool, 'path-generic': PathGeneric, recap: Recap, recovery: Recovery };
const Scene = SCENES[SCENE] || PathTool;
createRoot(document.getElementById('root')).render(
  <div data-host-scene={SCENE}>
    <button type="button" data-host-sentinel="start">Start (sentinel)</button>
    <Scene />
    <button type="button" data-host-sentinel="end">End (sentinel)</button>
  </div>,
);
