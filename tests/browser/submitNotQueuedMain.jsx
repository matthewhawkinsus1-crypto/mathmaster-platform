/*
 * A SUBMISSION THE DEVICE COULD NOT QUEUE (Batch 3, RUN-3), in the real engine.
 *
 * QuestionEngine with an ordinary student host. `window.__hostFails` decides
 * what the host answers Submit with, exactly as App.jsx handleGradeSubmit does:
 *
 *   'not-queued'  the durable outbox write failed: SUBMISSION_NOT_QUEUED
 *   'null'        the old host's answer to the same failure (the defect)
 *   false         the attempt was queued: the host's own result
 *
 * Driven by tests/browser/submitNotQueued.mjs.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { SUBMISSION_NOT_QUEUED } from '../../src/platform/student/submissionNotQueued.js';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
window.__hostFails = params.get('host') || 'not-queued';
window.__grades = [];

const QUESTION = {
  questionId: 'q-not-queued',
  type: 'multiAnswer',
  prompt: 'What is 5 + 7?',
  activityRole: 'classwork',
  answerFields: [{ id: 'sum', label: 'Sum', inputProfile: 'number', answer: '12' }],
};
const STUDENT = 'harness-not-queued';
const ASSIGNMENT = 'asg-not-queued';

function Harness() {
  const [record, setRecord] = useState({ status: 'unattempted', attemptCount: 0, totalAttempts: 0, variantIndex: 0 });
  const onGrade = async (isCorrect, details, parts, support, responseKey) => {
    window.__grades.push({ isCorrect, responseKey, host: window.__hostFails });
    if (window.__hostFails === 'not-queued') return SUBMISSION_NOT_QUEUED;
    if (window.__hostFails === 'null') return null;
    const attemptCount = record.attemptCount + 1;
    setRecord({ ...record, status: isCorrect ? 'correct' : 'attempted', attemptCount, totalAttempts: attemptCount, lastResponseKey: responseKey });
    return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount, remainingAttempts: Math.max(0, 3 - attemptCount) };
  };
  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }} data-question-stage>
      <QuestionEngine
        question={QUESTION}
        questionRecord={record}
        generationKey={`${ASSIGNMENT}|${STUDENT}|0|variant:0`}
        onGrade={onGrade}
        studentProfile={{}}
        activityRole="classwork"
        maximumAttempts={3}
        draftKey={buildQuestionDraftKey({ studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 0, variantIndex: 0 })}
        assignmentId={ASSIGNMENT}
        executionScope="student"
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
