// Algebra I · Module 2 · Topic 2, Lessons 2 and 3, as a student receives them.
//
//   ?lesson=l2   Vertical and Horizontal Transformations of Linear Functions (default)
//   ?lesson=l3   Slopes of Perpendicular Lines and Horizontal & Vertical Lines
//   ?q=<id>      open on one question (e.g. l2-cw-1)
//   ?run=<name>  a separate student, so drafts from one walkthrough never leak
//                into the next
//
// The questions are NOT the raw JSON. They go through the same chain a teacher
// import and publish run (parse -> preflight review -> preflight model ->
// validateAssignmentQuestions -> rebuildV5SectionsFromQuestions), because the
// import recompiles by studentActions and a harness that mounts raw JSON can
// pass while the published assignment is broken. Same pattern as
// linearMultipleRepresentationsMain.jsx.
//
// The page has no Firebase: drafts live in localStorage, verdicts come from the
// shared graders in the browser. window.__m2t2 is a READ-ONLY bridge for a
// driver (navigate, read the saved draft, read the verdicts) — it never writes
// student state.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import L2_TEXT from '../../teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json?raw';
import L3_TEXT from '../../teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json?raw';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';

// Vite's dev optimizer moves mathlive into .vite/deps without its fonts.
MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const LESSON = params.get('lesson') === 'l3' ? 'l3' : 'l2';
const TEXT = LESSON === 'l3' ? L3_TEXT : L2_TEXT;
const ASSIGNMENT = `m2t2-${LESSON}`;
const STUDENT = `m2t2-student-${params.get('run') || 'a'}`;

const compile = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  if (!model.isValid) throw new Error(`Preflight rejected the assignment:\n${model.errors.join('\n')}`);
  const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
  return { title: model.assignmentV5?.assignment?.title || '', sections: rebuildV5SectionsFromQuestions(model.assignmentV5, questions), preflight: model };
};

const compiled = compile(TEXT);
const allQuestions = compiled.sections.flatMap((section, sectionIndex) => section.questions.map((question, index) => ({ section, sectionIndex, question, index })));
const generationKeyFor = (question) => `${ASSIGNMENT}|${STUDENT}|${question.questionId}|variant:0`;

const startId = params.get('q');
let current = Math.max(0, allQuestions.findIndex((entry) => entry.question.questionId === startId));
const listeners = new Set();
const notify = () => listeners.forEach((listen) => listen(current));

const draftKeyFor = (flatIndex) => buildQuestionDraftKey({
  studentId: STUDENT,
  assignmentId: ASSIGNMENT,
  questionIndex: flatIndex,
  variantIndex: 0,
  sessionMode: 'graded',
});

const grades = [];
const tag = (role) => ({ warmup: 'WU', classwork: 'CW', practice: 'PR', dol: 'DOL' }[role] || 'Q');

function Harness() {
  const [position, setPosition] = useState(current);
  useEffect(() => { listeners.add(setPosition); return () => listeners.delete(setPosition); }, []);
  const { section, question } = allQuestions[position];
  const draftKey = useMemo(() => draftKeyFor(position), [position]);
  const dol = section.role === 'dol';
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '12px 16px' }} data-section={section.id} data-question-id={question.questionId}>
      <h1 style={{ fontSize: 16, margin: '0 0 8px' }}>{compiled.title}</h1>
      <nav aria-label="Assignment questions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        {allQuestions.map((entry, flat) => (
          <button
            key={entry.question.questionId}
            type="button"
            data-nav={entry.question.questionId}
            onClick={() => { current = flat; notify(); }}
            aria-current={flat === position ? 'step' : undefined}
            style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #b8cdf0', background: flat === position ? '#174ea6' : '#fff', color: flat === position ? '#fff' : '#174ea6', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
          >
            {`${tag(entry.section.role)} ${entry.index + 1}`}
          </button>
        ))}
      </nav>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#174ea6', letterSpacing: '.06em', margin: '0 0 8px' }}>{section.title.toUpperCase()}</div>
      <QuestionEngine
        key={`${ASSIGNMENT}-${question.questionId}-draft0`}
        question={question}
        questionRecord={null}
        generationKey={generationKeyFor(question)}
        onGrade={(isCorrect, details, parts, _support, _responseKey, meta) => {
          grades.push({ questionId: question.questionId, isCorrect, details, parts, partialCreditPercent: meta?.partialCreditPercent ?? null });
          return null;
        }}
        onStepGrade={() => {}}
        studentProfile={{}}
        activityRole={section.role}
        dolMode={dol}
        maximumAttempts={section.attemptsAllowed || 3}
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
    if (key && key.includes(prefix)) {
      try { drafts[key] = JSON.parse(window.localStorage.getItem(key)); } catch { drafts[key] = window.localStorage.getItem(key); }
    }
  }
  return drafts;
};

window.__m2t2 = {
  lesson: LESSON,
  ids: () => allQuestions.map((entry) => entry.question.questionId),
  go: (questionId) => {
    const flat = allQuestions.findIndex((entry) => entry.question.questionId === questionId);
    if (flat === -1) return false;
    current = flat;
    notify();
    return true;
  },
  drafts: () => readDrafts(`${STUDENT}:${ASSIGNMENT}`),
  grades: () => [...grades],
  question: (questionId) => allQuestions.find((entry) => entry.question.questionId === questionId)?.question || null,
  preflight: () => ({ isValid: compiled.preflight.isValid, errors: compiled.preflight.errors, warnings: compiled.preflight.warnings }),
};

createRoot(document.getElementById('root')).render(<Harness />);
