/*
 * GENERATED SPECIAL CASES, IN A REAL BROWSER, THROUGH THE REAL QUESTION ENGINE.
 *
 * One seated student's version of one family slot (questionFamilyCasesSlots.mjs),
 * mounted exactly as App.jsx mounts an assignment question: QuestionEngine with
 * the family context buildStudentFamilyContext writes for a seated student, a
 * draft key from buildQuestionDraftKey, and onGrade / onFamilyDelivery
 * recording what the browser decided and what it delivered.
 *
 * The driver (questionFamilyCases.mjs) reads the delivered question, solves it
 * through the workspace's own controls, and re-grades the captured response on
 * the server path in node.
 *
 *   ?slot=<slot id>&student=<1-30>
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { buildStudentFamilyContext } from '../../src/platform/generation/familyDelivery.js';
import {
  CASES_ASSIGNMENT_ID,
  CASES_CLASS_ID,
  CASES_SLOTS,
  CASES_STUDENTS,
  casesAssignment,
  slotStorageIndex,
} from './questionFamilyCasesSlots.mjs';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const slotId = params.get('slot') || 'eq-none';
const studentNumber = Math.min(CASES_STUDENTS.length, Math.max(1, Number(params.get('student')) || 1));
const studentId = CASES_STUDENTS[studentNumber - 1];
const question = CASES_SLOTS[slotId];
const storageIndex = slotStorageIndex(slotId);
const assignment = casesAssignment();

const errors = [];
window.addEventListener('error', (event) => errors.push(String(event.error?.message || event.message)));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason?.message || event.reason)));

const record = {
  slotId,
  studentId,
  storageIndex,
  delivery: null,
  question: null,
  grades: [],
  errors,
};
window.__qfc = record;

const familyContext = buildStudentFamilyContext({
  assignment,
  question,
  storageIndex,
  studentId,
  classId: CASES_CLASS_ID,
  record: null,
  preview: false,
});

function Harness() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '12px 16px' }} data-harness-slot={slotId}>
      <QuestionEngine
        key={`${CASES_ASSIGNMENT_ID}-${storageIndex}-0-open`}
        question={question}
        questionRecord={null}
        generationKey={`${CASES_ASSIGNMENT_ID}|${studentId}|${storageIndex}|variant:0`}
        familyContext={familyContext}
        onFamilyDelivery={(delivery, rendered) => {
          record.delivery = JSON.parse(JSON.stringify(delivery));
          record.question = JSON.parse(JSON.stringify(rendered || null));
        }}
        onGrade={(isCorrect, questionDetails, parts, supportUsage, responseKey, meta) => {
          record.grades.push(JSON.parse(JSON.stringify({
            isCorrect,
            parts: parts || null,
            responseKey: responseKey ?? null,
            toolResponse: meta?.toolResponse ?? null,
            partialCreditPercent: meta?.partialCreditPercent ?? null,
          })));
          return null;
        }}
        onStepGrade={() => null}
        studentProfile={{}}
        activityRole="classwork"
        maximumAttempts={3}
        draftKey={buildQuestionDraftKey({ studentId, assignmentId: CASES_ASSIGNMENT_ID, questionIndex: storageIndex, variantIndex: 0, sessionMode: 'graded' })}
        assignmentId={CASES_ASSIGNMENT_ID}
        executionScope="student"
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
