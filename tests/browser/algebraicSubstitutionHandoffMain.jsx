/*
 * CLASSWORK Q2, IN A REAL BROWSER, THROUGH THE REAL QUESTION ENGINE.
 *
 * Issue #334: the substitution handoff for
 *
 *   x - 2y = -3
 *   3x + 5y = 24
 *
 * failed live after five fixes that each passed their unit tests. Every one of
 * those tests fed the engine a hand-written token string. None of them fed it
 * the string Step Algebra actually produces, and that string was the bug.
 *
 * So nothing here is hand-written. QuestionEngine is mounted exactly the way
 * App.jsx mounts it — same `key` shape, same `draftKey` builder, the same two
 * `executionScope`s for Student View and Teacher Preview — and the driver
 * (algebraicSubstitutionHandoff.mjs) isolates x by operating Step Algebra's own
 * controls, so the isolated expression and the token are whatever the platform
 * really serialises.
 *
 * HOW TO RUN: see algebraicSubstitutionHandoff.mjs.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import '../../src/index.css';
import '../../src/App.css';

const ASSIGNMENT = 'issue-334-classwork';
const QUESTION_INDEX = 1; // Classwork Q2

// The Classwork Q2 question as stored: a Systems Workspace question whose
// intent is algebraic substitution. No `mode` — the live record relies on
// resolveSystemsWorkspaceMode to route it, so the harness does too.
const CLASSWORK_Q2 = Object.freeze({
  questionId: 'issue-334-classwork-q2',
  type: 'systemsWorkspace',
  prompt: 'Solve the system by substitution.',
  studentActions: ['solveSystem'],
  method: 'substitution',
  equations: ['x - 2y = -3', '3x + 5y = 24'],
  variables: ['x', 'y'],
  requireVerification: true,
});

const EXACT_FRACTION_SYSTEM = Object.freeze({
  questionId: 'exact-fraction-systems-display',
  type: 'systemsWorkspace',
  prompt: 'Solve the system by substitution.',
  studentActions: ['solveSystem'],
  method: 'substitution',
  equations: ['2x - y = 7', '-3x - 3y = 1'],
  variables: ['x', 'y'],
  requireVerification: true,
});

const ELIMINATION_DIRECT_SYSTEM = Object.freeze({
  questionId: 'elimination-direct-equation-flow',
  type: 'systemsWorkspace',
  prompt: 'Solve the system by elimination.',
  studentActions: ['solveSystem'],
  method: 'elimination',
  equations: ['x + y = 2', 'x - 3y = -6'],
  variables: ['x', 'y'],
  requireVerification: true,
});

// Student View and Teacher Preview differ in exactly the props App.jsx varies.
const SCOPES = {
  student: { studentId: 'issue-334-student', sessionMode: 'graded', executionScope: 'student', keySuffix: 'open' },
  teacherPreview: { studentId: 'teacher-preview', sessionMode: 'preview', executionScope: 'teacherPreview', keySuffix: 'preview-session-1' },
};

const listeners = new Set();
// `?scope=teacherPreview` opens Teacher Preview directly, so the driver can seed
// a draft and reload into either scope with every module freshly evaluated.
const params = new URLSearchParams(window.location.search);
const initialScope = params.get('scope');
const requestedQuestionIndex = Number(params.get('q'));
const initialQuestionIndex = Number.isInteger(requestedQuestionIndex) && requestedQuestionIndex >= 0
  ? requestedQuestionIndex
  : QUESTION_INDEX;
let current = { scope: SCOPES[initialScope] ? initialScope : 'student', questionIndex: initialQuestionIndex };
const notify = () => listeners.forEach((listen) => listen({ ...current }));

const draftKeyFor = (scope, questionIndex) => buildQuestionDraftKey({
  studentId: SCOPES[scope].studentId,
  assignmentId: ASSIGNMENT,
  questionIndex,
  variantIndex: 0,
  sessionMode: SCOPES[scope].sessionMode,
});

// Q1 is a different question, so "leave Q2 and come back" is a genuine
// remount of the Q2 workspace, as it is in the live assignment.
const QUESTIONS = [
  { questionId: 'issue-334-classwork-q1', type: 'systemsWorkspace', mode: 'linear', prompt: 'Classify the system.', system: { m1: 2, b1: 1, m2: -1, b2: 7 } },
  CLASSWORK_Q2,
  EXACT_FRACTION_SYSTEM,
  ELIMINATION_DIRECT_SYSTEM,
];

function Harness() {
  const [position, setPosition] = useState(current);
  useEffect(() => { listeners.add(setPosition); return () => listeners.delete(setPosition); }, []);
  const scope = SCOPES[position.scope];
  const draftKey = useMemo(() => draftKeyFor(position.scope, position.questionIndex), [position.scope, position.questionIndex]);
  return (
    <div data-handoff-scope={position.scope} data-question-index={position.questionIndex} data-draft-key={draftKey}>
      <QuestionEngine
        key={`${ASSIGNMENT}-${position.questionIndex}-0-${scope.keySuffix}-draft0`}
        question={QUESTIONS[position.questionIndex]}
        questionRecord={null}
        generationKey={`${ASSIGNMENT}|${scope.studentId}|${position.questionIndex}|variant:0`}
        onGrade={() => null}
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

window.__mmHandoff = {
  question: CLASSWORK_Q2,
  /** Navigate to another question in the assignment — a real remount. */
  go: (questionIndex) => { current = { ...current, questionIndex: Number(questionIndex) }; notify(); return current.questionIndex; },
  draftKey: () => draftKeyFor(current.scope, current.questionIndex),
  /** Every stored draft record for the current question, keyed by suffix. */
  drafts: () => readDrafts(draftKeyFor(current.scope, current.questionIndex)),
  /** Write one raw draft record exactly as `writeQuestionDraft` would. */
  seedDraft: (suffix, value, savedAt = Date.now()) => {
    const key = `${draftKeyFor(current.scope, current.questionIndex)}${suffix}`;
    window.localStorage.setItem(key, JSON.stringify({ version: 2, savedAt, value }));
    return key;
  },
  clearStorage: () => { window.localStorage.clear(); return true; },
};

createRoot(document.getElementById('root')).render(<Harness />);
