// PR #397: the FINAL Algebra I multiple-representations assignment, as a
// student receives it.
//
// The questions are NOT the raw JSON. They go through the same chain a teacher
// import and publish run (parse -> preflight review -> preflight model ->
// validateAssignmentQuestions -> rebuildV5SectionsFromQuestions), because the
// import recompiles by studentActions and a harness that mounts raw JSON can
// pass while the published assignment is broken.
//
// ?gallery=1 adds one question per GIVEN source kind the final assignment does
// not use (two points, graph, coefficient-authored standard form, point + slope,
// m/b slope-intercept), compiled through the same chain.
//
// ?family=1 mounts the family-backed upgrade
// (docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json)
// instead, through the same chain. QuestionEngine generates this student's
// version of each question from its Question Family; window.__lmr.delivered
// repeats exactly that call so the driver can work out the answers from the
// version's own line.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import FINAL_TEXT from '../../docs/assignments/algebra1-linear-multiple-representations-final-v5.json?raw';
import FAMILY_TEXT from '../../docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json?raw';
import { generateQuestion } from '../../src/problemGenerator.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';

// Vite's dev optimizer moves mathlive into .vite/deps without its fonts, so a
// dev page typesets in fallback serif. Point it at the package's own fonts so
// what this harness shows is what the built app shows.
MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const FAMILY = params.get('family') === '1';
const ASSIGNMENT = FAMILY ? 'family-linear-multiple-representations' : 'pr397-linear-multiple-representations';
const STUDENT = `pr397-student-${params.get('run') || 'a'}`;

const bridge = (questionId, prompt, source, extra = {}) => ({
  questionId,
  standard: 'A.2B',
  alignments: [{ framework: 'teks', code: 'A.2B', role: 'primary' }],
  type: 'representationBridge',
  mode: 'linearMultipleRepresentations',
  studentActions: ['connectLinearRepresentations'],
  difficultyBand: 2,
  dok: 2,
  prompt,
  source,
  feedbackTiming: 'guided',
  ...extra,
});

const GALLERY = {
  schemaVersion: 5,
  assignment: { title: 'Given source gallery', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{
    id: 'gallery',
    role: 'classwork',
    title: 'Given source gallery',
    feedbackMode: 'immediate',
    hintsAllowed: true,
    attemptsAllowed: 3,
    questions: [
      bridge('gal-two-points', 'You are given two points on a line. Build the other representations.', { kind: 'twoPoints', points: [[-2, -5], [4, -2]] }),
      bridge('gal-graph', 'You are given the graph of a line. Build the other representations.', { kind: 'graph', points: [[0, 1], [3, -1]] }),
      bridge('gal-standard-abc', 'You are given a standard form equation. Build the other representations.', { kind: 'standardForm', A: 2, B: -4, C: 12 }),
      bridge('gal-point-slope-pm', 'You are given a point-slope equation. Build the other representations.', { kind: 'pointSlope', point: [2, -2], m: 0.5 }),
      bridge('gal-slope-intercept-mb', 'You are given a slope-intercept equation. Build the other representations.', { kind: 'slopeIntercept', m: -0.75, b: 2 }),
      bridge('gal-snap-y-equals-x', 'You are given y = x. Build the other representations.', { kind: 'slopeIntercept', equation: 'y = x' }, { snapStep: 1 }),
    ],
  }],
};

const compile = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  if (!model.isValid) throw new Error(`Preflight rejected the assignment:\n${model.errors.join('\n')}`);
  const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
  return { sections: rebuildV5SectionsFromQuestions(model.assignmentV5, questions), preflight: model };
};

const compiled = compile(FAMILY ? FAMILY_TEXT : FINAL_TEXT);
const generationKeyFor = (question) => `${ASSIGNMENT}|${STUDENT}|${question.questionId}|variant:0`;
const sections = params.get('gallery') ? [...compiled.sections, ...compile(JSON.stringify(GALLERY)).sections] : compiled.sections;
const allQuestions = sections.flatMap((section, sectionIndex) => section.questions.map((question, index) => ({ section, sectionIndex, question, index })));

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
            {entry.section.id === 'gallery' ? entry.question.questionId.replace('gal-', '') : `${tag(entry.section.role)} ${entry.index + 1}`}
          </button>
        ))}
      </nav>
      {/* The question's prompt is rendered by QuestionEngine's own "Your task"
          card, exactly as in the assignment player; only the section is named here. */}
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

window.__lmr = {
  go: (questionId) => {
    const flat = allQuestions.findIndex((entry) => entry.question.questionId === questionId);
    if (flat === -1) return false;
    current = flat;
    notify();
    return true;
  },
  drafts: () => readDrafts(`${STUDENT}:${ASSIGNMENT}`),
  // Read-only: the tool's saved work record for one question, as the draft
  // layer stored it (the driver never writes it).
  work: (questionId) => {
    const flat = allQuestions.findIndex((entry) => entry.question.questionId === questionId);
    if (flat === -1) return null;
    try { return JSON.parse(window.localStorage.getItem(`${draftKeyFor(flat)}:work:tool`))?.value ?? null; } catch { return null; }
  },
  grades: () => [...grades],
  question: (questionId) => allQuestions.find((entry) => entry.question.questionId === questionId)?.question || null,
  // The version QuestionEngine shows this student: the same three calls, in order.
  delivered: (questionId) => {
    const question = allQuestions.find((entry) => entry.question.questionId === questionId)?.question;
    if (!question) return null;
    return normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(question, { serverGraded: false }), generationKeyFor(question), {}, null, null));
  },
  preflight: () => ({ isValid: compiled.preflight.isValid, errors: compiled.preflight.errors, warnings: compiled.preflight.warnings }),
};

createRoot(document.getElementById('root')).render(<Harness />);
