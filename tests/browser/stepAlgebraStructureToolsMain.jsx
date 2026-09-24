/*
 * FACTORING, FRACTION SPLITTING AND REDUCTION, IN A REAL BROWSER.
 *
 * Mounted the way App.jsx mounts a question — real QuestionEngine, real
 * draftKey — so the driver (stepAlgebraStructureTools.mjs) exercises exactly
 * what a student would: the Step Algebra balance, the new Factor / Split
 * fraction / Cancel factors / Simplify arithmetic / Arrange terms tools, the
 * real drafts and the Universal Undo.
 *
 *   Q0  stepAlgebra, compiled rewriteLinearForm: 5x + 2y = 6 -> y = mx + b
 *   Q1  stepAlgebra2 rewriteLinearForm factoredLinear: y = 15x - 45
 *   Q2  stepAlgebra2 rewriteLinearForm factoredLinear: y = -6x + 12
 *   Q3  stepAlgebra2 rewriteLinearForm slope-intercept: 2x - 4y = 8
 *   Q4  stepAlgebra plain solve: 3x + 6 = 21 (regression)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import '../../src/index.css';
import '../../src/App.css';

const ASSIGNMENT = 'structure-tools';

const QUESTIONS = [
  Object.freeze({ questionId: 'st-q0-slope', type: 'stepAlgebra', prompt: 'Rewrite 5x + 2y = 6 in slope-intercept form.', equation: '5x + 2y = 6', solveFor: 'y', targetForm: 'slopeIntercept', requireSimplifiedFinalForm: true }),
  Object.freeze({ questionId: 'st-q1-factored', type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear', prompt: 'Write y = 15x − 45 in factored linear form.', equation: 'y = 15x - 45' }),
  Object.freeze({ questionId: 'st-q2-factored-neg', type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear', prompt: 'Write y = −6x + 12 in factored linear form.', equation: 'y = -6x + 12' }),
  Object.freeze({ questionId: 'st-q3-rewrite-slope', type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'slopeIntercept', prompt: 'Rewrite 2x − 4y = 8 in slope-intercept form.', equation: '2x - 4y = 8' }),
  Object.freeze({ questionId: 'st-q4-solve', type: 'stepAlgebra', prompt: 'Solve for x.', equation: '3x + 6 = 21', solveFor: 'x' }),
];

const params = new URLSearchParams(window.location.search);
const listeners = new Set();
let current = { questionIndex: Number(params.get('q') || 0) };
const notify = () => listeners.forEach((listen) => listen({ ...current }));

const draftKeyFor = (questionIndex) => buildQuestionDraftKey({
  studentId: 'structure-student', assignmentId: ASSIGNMENT, questionIndex, variantIndex: 0, sessionMode: 'graded',
});

const grades = [];

function Harness() {
  const [position, setPosition] = useState(current);
  useEffect(() => { listeners.add(setPosition); return () => listeners.delete(setPosition); }, []);
  const draftKey = useMemo(() => draftKeyFor(position.questionIndex), [position.questionIndex]);
  return (
    <div data-question-index={position.questionIndex} data-draft-key={draftKey} style={{ maxWidth: 1200, margin: '0 auto' }}>
      <QuestionEngine
        key={`${ASSIGNMENT}-${position.questionIndex}-0-open-draft0`}
        question={QUESTIONS[position.questionIndex]}
        questionRecord={null}
        generationKey={`${ASSIGNMENT}|structure-student|${position.questionIndex}|variant:0`}
        onGrade={(payload) => { grades.push(payload); return null; }}
        onStepGrade={() => {}}
        studentProfile={{}}
        activityRole="classwork"
        maximumAttempts={3}
        draftKey={draftKey}
        assignmentId={ASSIGNMENT}
        executionScope="student"
      />
    </div>
  );
}

const readDrafts = (prefix) => {
  const drafts = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(prefix)) drafts[key.slice(prefix.length)] = JSON.parse(window.localStorage.getItem(key)).value;
  }
  return drafts;
};

window.__mmStructure = {
  go: (questionIndex) => { current = { questionIndex: Number(questionIndex) }; notify(); return current.questionIndex; },
  drafts: () => readDrafts(draftKeyFor(current.questionIndex)),
  grades: () => grades.map((grade) => JSON.parse(JSON.stringify(grade, (key, value) => (typeof value === 'function' ? undefined : value)))),
  clearStorage: () => { window.localStorage.clear(); return true; },
};

createRoot(document.getElementById('root')).render(<Harness />);
