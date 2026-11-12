// Algebra II Honors · Solving Radical Equations (Step Algebra), as a student receives it.
//
//   ?q=<id>      open on one question (e.g. srh-cw-1)
//   ?run=<name>  a separate student, so drafts from one walkthrough never leak into the next
//
// The same harness as algebra2PolynomialsLessonMain.jsx: the lesson goes through the chain a
// teacher import and publish run (parse -> preflight review -> preflight model ->
// validateAssignmentQuestions -> rebuildV5SectionsFromQuestions) and mounts in the real
// QuestionEngine, with no Firebase.
//
// Five extra Classwork questions (fixtures/radicalStepAlgebraScenarios.json: a cube root, a
// repeated root, two genuine solutions, every candidate failing, a structural no-solution) are
// appended to the lesson BEFORE it is compiled, so they take the very same chain.
//
// window.__radical is a READ-ONLY bridge for a driver. It records what the app reports —
// each graded attempt with its tool response, and each step's raw work — and never writes
// student state.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { recordQuestionAttempt, resolveQuestionMaximumAttempts } from '../../src/attemptPolicy.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import LESSON_TEXT from '../../teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors_Step_Algebra.json?raw';
import SCENARIOS_TEXT from './fixtures/radicalStepAlgebraScenarios.json?raw';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';

// Vite's dev optimizer moves mathlive into .vite/deps without its fonts.
MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const ASSIGNMENT = 'a2-radical-step-algebra';
const STUDENT = `radical-student-${params.get('run') || 'a'}`;

const withScenarios = () => {
  const lesson = JSON.parse(LESSON_TEXT);
  const classwork = lesson.sections.find((section) => section.role === 'classwork');
  classwork.questions.push(...JSON.parse(SCENARIOS_TEXT));
  return JSON.stringify(lesson);
};

const compile = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  if (!model.isValid) throw new Error(`Preflight rejected the assignment:\n${model.errors.join('\n')}`);
  const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
  return { title: model.assignmentV5?.assignment?.title || '', sections: rebuildV5SectionsFromQuestions(model.assignmentV5, questions), preflight: model };
};

const compiled = compile(withScenarios());
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
const steps = [];
// The server's question records for this run, kept across a reload like the server keeps them.
const RECORDS_KEY = `radical-harness-records:${STUDENT}`;
const readRecords = () => {
  try { return JSON.parse(window.localStorage.getItem(RECORDS_KEY)) || {}; } catch { return {}; }
};
const records = readRecords();
const tag = (role) => ({ warmup: 'WU', classwork: 'CW', practice: 'PR', dol: 'DOL' }[role] || 'Q');

function Harness() {
  const [position, setPosition] = useState(current);
  useEffect(() => { listeners.add(setPosition); return () => listeners.delete(setPosition); }, []);
  const { section, question } = allQuestions[position];
  const draftKey = useMemo(() => draftKeyFor(position), [position]);
  const [, setRecordVersion] = useState(0);
  const record = records[question.questionId] || null;
  const dol = section.role === 'dol';
  const guidedNotesMode = { classwork: 'automatic', practice: 'off' }[section.role] || 'off';
  const maximumAttempts = resolveQuestionMaximumAttempts({ question, maximumAttempts: section.attemptsAllowed || 3 });
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
        questionRecord={record}
        generationKey={generationKeyFor(question)}
        onGrade={(isCorrect, details, parts, supportUsage, responseKey, meta) => {
          grades.push({
            questionId: question.questionId,
            isCorrect,
            details,
            parts,
            partialCreditPercent: meta?.partialCreditPercent ?? null,
            toolResponse: meta?.toolResponse ? JSON.parse(JSON.stringify(meta.toolResponse)) : null,
          });
          const outcome = recordQuestionAttempt({
            record: records[question.questionId],
            isCorrect,
            questionDetails: details,
            parts,
            supportUsage,
            responseKey,
            partialCreditPercent: meta?.partialCreditPercent,
            maximumAttempts,
          });
          records[question.questionId] = outcome.record;
          try { window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch { /* a private window keeps them for this page only */ }
          setRecordVersion((version) => version + 1);
          return outcome.result;
        }}
        onStepGrade={(payload) => {
          // Exactly what App.handleStepGrade receives: the workspace's own step credit and its raw work.
          steps.push({ questionId: question.questionId, payload: JSON.parse(JSON.stringify(payload || {})) });
          return { queued: true };
        }}
        studentProfile={{}}
        activityRole={section.role}
        guidedMode={['classwork', 'practice'].includes(section.role) && guidedNotesMode !== 'off'}
        guidedNotesMode={guidedNotesMode}
        dolMode={dol}
        maximumAttempts={maximumAttempts}
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

window.__radical = {
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
  steps: () => [...steps],
  records: () => JSON.parse(JSON.stringify(records)),
  question: (questionId) => JSON.parse(JSON.stringify(allQuestions.find((entry) => entry.question.questionId === questionId)?.question || null)),
  // The question this student was GIVEN: the same call QuestionEngine makes, so a family item is the
  // generated version (its filled equation), not the template.
  generated: (questionId) => {
    const entry = allQuestions.find((candidate) => candidate.question.questionId === questionId);
    return entry ? JSON.parse(JSON.stringify(generateQuestion(entry.question, generationKeyFor(entry.question), {}, null, null))) : null;
  },
  preflight: () => ({ isValid: compiled.preflight.isValid, errors: compiled.preflight.errors, warnings: compiled.preflight.warnings }),
};

createRoot(document.getElementById('root')).render(<Harness />);
