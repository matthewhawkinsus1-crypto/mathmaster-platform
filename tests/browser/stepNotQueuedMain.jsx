/*
 * A STEP OR A NEW PROBLEM THE DEVICE COULD NOT QUEUE (pass 3, wave 7), in the
 * real engine and the real Step Algebra solver.
 *
 * QuestionEngine with an ordinary student host. `window.__hostFails` decides
 * what the host answers, exactly as App.jsx does when its durable outbox
 * write fails:
 *
 *   ?scene=step         a Step Algebra question (3x + 6 = 21); the host's
 *                       onStepGrade answers STEP_NOT_QUEUED while failing
 *   ?scene=relation     an inequality (2x + 3 < 11), the relation solver
 *   ?scene=flip         -2x < 6: dividing by -2 asks for the relation symbol
 *   ?scene=replacement  a closed question offering a new problem; the host's
 *                       onRequestNewQuestion answers REPLACEMENT_NOT_QUEUED
 *
 * `?host=null` replays the old host (null, nothing said) to show the defect.
 * Driven by tests/browser/stepNotQueued.mjs.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey, writeQuestionDraft } from '../../src/questionDraftStorage.js';
import { REPLACEMENT_NOT_QUEUED, STEP_NOT_QUEUED } from '../../src/platform/student/submissionNotQueued.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene') || 'step';
const oldHost = params.get('host') === 'null';
window.__hostFails = true;
window.__calls = [];

const STUDENT = 'harness-step-not-queued';
const ASSIGNMENT = `asg-${scene}-not-queued`;
const QUESTIONS = {
  step: { questionId: 'q-step', type: 'stepAlgebra', prompt: 'Solve for x.', equation: '3x + 6 = 21', solveFor: 'x', activityRole: 'classwork' },
  relation: { questionId: 'q-relation', type: 'stepAlgebra', prompt: 'Solve the inequality.', equation: '2x + 3 < 11', solveFor: 'x', activityRole: 'classwork' },
  flip: { questionId: 'q-flip', type: 'stepAlgebra', prompt: 'Solve the inequality.', equation: '-2x < 6', solveFor: 'x', activityRole: 'classwork' },
  replacement: {
    questionId: 'q-replace',
    type: 'multiAnswer',
    prompt: 'What is 5 + 7?',
    activityRole: 'practice',
    answerFields: [{ id: 'sum', label: 'Sum', inputProfile: 'number', answer: '12' }],
  },
};
const question = QUESTIONS[scene];
const draftKeyFor = (variantIndex) => buildQuestionDraftKey({ studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 0, variantIndex });
window.__draftKey = draftKeyFor(0);
window.__draftKeys = () => Object.keys(window.localStorage).filter((key) => key.startsWith(window.__draftKey));

// The closed question's own work, so the driver can see it is kept.
if (scene === 'replacement') writeQuestionDraft(window.__draftKey, { sum: '11' }, { edit: true });

function Harness() {
  const [record, setRecord] = useState(scene === 'replacement'
    ? { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastResponseKey: '11' }
    : { status: 'unattempted', attemptCount: 0, totalAttempts: 0, variantIndex: 0 });
  const onStepGrade = async (payload) => {
    window.__calls.push({ kind: 'step', label: payload?.stepGrade?.label || null, failing: window.__hostFails });
    if (window.__hostFails) return oldHost ? null : STEP_NOT_QUEUED;
    return { recorded: true };
  };
  const onRequestNewQuestion = async () => {
    window.__calls.push({ kind: 'replacement', failing: window.__hostFails });
    if (window.__hostFails) return oldHost ? undefined : REPLACEMENT_NOT_QUEUED;
    setRecord((current) => ({ ...current, status: 'unattempted', attemptCount: 0, variantIndex: current.variantIndex + 1 }));
    return undefined;
  };
  const onGrade = async () => null;
  const policy = scene === 'replacement' ? { ...getEffectiveActivityPolicy('practice'), allowReplacement: true } : undefined;
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }} data-question-stage data-variant={record.variantIndex}>
      <QuestionEngine
        key={`${ASSIGNMENT}-${record.variantIndex}`}
        question={question}
        questionRecord={record}
        generationKey={`${ASSIGNMENT}|${STUDENT}|0|variant:${record.variantIndex}`}
        onGrade={onGrade}
        onStepGrade={onStepGrade}
        onRequestNewQuestion={onRequestNewQuestion}
        studentProfile={{}}
        activityRole={question.activityRole}
        activityPolicy={policy}
        maximumAttempts={scene === 'replacement' ? 1 : 3}
        draftKey={draftKeyFor(record.variantIndex)}
        assignmentId={ASSIGNMENT}
        executionScope="student"
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
