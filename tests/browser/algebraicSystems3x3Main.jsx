/*
 * ISSUE #341, IN A REAL BROWSER, THROUGH THE REAL QUESTION ENGINE.
 *
 * Mounted exactly the way App.jsx mounts a question — same `key` shape, same
 * `draftKey` builder, the same two `executionScope`s for Student View and
 * Teacher Preview — so the driver (algebraicSystems3x3.mjs) exercises what a
 * student would: the real embedded Step Algebra controls, the real tokens, the
 * real drafts and the real reduced 2×2 workflow.
 *
 *   Q1  a 3×3 system authored in the plain shape #341 asks for — no `mode`,
 *       no per-step metadata; dimension and mode are inferred
 *   Q2  a different question, so "leave and come back" is a genuine remount
 *   Q3  standalone Step Algebra -9x + 21 = 1, for the no-staged-preview rule
 *
 * HOW TO RUN: see algebraicSystems3x3.mjs.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import '../../src/index.css';
import '../../src/App.css';

const ASSIGNMENT = 'issue-341-systems';

const QUESTIONS = [
  Object.freeze({
    questionId: 'issue-341-q1-3x3',
    type: 'systemsWorkspace',
    prompt: 'Solve the system by substitution.',
    method: 'substitution',
    variables: ['x', 'y', 'z'],
    equations: ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'],
    requireVerification: true,
  }),
  Object.freeze({ questionId: 'issue-341-q2-linear', type: 'systemsWorkspace', mode: 'linear', prompt: 'Classify the system.', system: { m1: 2, b1: 1, m2: -1, b2: 7 } }),
  Object.freeze({ questionId: 'issue-341-q3-step', type: 'stepAlgebra', prompt: 'Solve for x.', equation: '-9x + 21 = 1', solveFor: 'x' }),
];

const SCOPES = {
  student: { studentId: 'issue-341-student', sessionMode: 'graded', executionScope: 'student', keySuffix: 'open' },
  teacherPreview: { studentId: 'teacher-preview', sessionMode: 'preview', executionScope: 'teacherPreview', keySuffix: 'preview-session-1' },
};

const params = new URLSearchParams(window.location.search);
const listeners = new Set();
let current = {
  scope: SCOPES[params.get('scope')] ? params.get('scope') : 'student',
  questionIndex: Number(params.get('q') || 0),
};
const notify = () => listeners.forEach((listen) => listen({ ...current }));

const draftKeyFor = (scope, questionIndex) => buildQuestionDraftKey({
  studentId: SCOPES[scope].studentId,
  assignmentId: ASSIGNMENT,
  questionIndex,
  variantIndex: 0,
  sessionMode: SCOPES[scope].sessionMode,
});

const grades = [];

function Harness() {
  const [position, setPosition] = useState(current);
  useEffect(() => { listeners.add(setPosition); return () => listeners.delete(setPosition); }, []);
  const scope = SCOPES[position.scope];
  const draftKey = useMemo(() => draftKeyFor(position.scope, position.questionIndex), [position.scope, position.questionIndex]);
  return (
    <div data-scope={position.scope} data-question-index={position.questionIndex} data-draft-key={draftKey}>
      <QuestionEngine
        key={`${ASSIGNMENT}-${position.questionIndex}-0-${scope.keySuffix}-draft0`}
        question={QUESTIONS[position.questionIndex]}
        questionRecord={null}
        generationKey={`${ASSIGNMENT}|${scope.studentId}|${position.questionIndex}|variant:0`}
        onGrade={(payload) => { grades.push(payload); return null; }}
        onStepGrade={() => {}}
        studentProfile={position.scope === 'teacherPreview' ? null : {}}
        activityRole="classwork"
        maximumAttempts={3}
        draftKey={draftKey}
        assignmentId={ASSIGNMENT}
        executionScope={scope.executionScope}
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

window.__mm341 = {
  go: (questionIndex) => { current = { ...current, questionIndex: Number(questionIndex) }; notify(); return current.questionIndex; },
  drafts: () => readDrafts(draftKeyFor(current.scope, current.questionIndex)),
  grades: () => grades.map((grade) => JSON.parse(JSON.stringify(grade, (key, value) => (typeof value === 'function' ? undefined : value)))),
  clearStorage: () => { window.localStorage.clear(); return true; },
};

createRoot(document.getElementById('root')).render(<Harness />);
