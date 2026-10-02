// PROCESS MODE ON THE MULTIPLE REPRESENTATIONS BOARD, AS A STUDENT RECEIVES IT.
//
// Process Mode boards for every GIVEN kind, compiled through the same chain a
// teacher import and publish run (parse -> preflight review -> preflight model
// -> validateAssignmentQuestions -> rebuildV5SectionsFromQuestions) and mounted
// in the real QuestionEngine — guided classwork, and a DOL whose outcomes are
// withheld.
//
// ?family=1 mounts the family-backed assignment
// (docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json)
// instead: its Process Mode boards are this student's generated versions.
//
// window.__pm lets the driver move between questions and read back — never
// write — the saved draft and the grades QuestionEngine reported.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import FAMILY_TEXT from '../../docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json?raw';
import { generateQuestion } from '../../src/problemGenerator.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const FAMILY = params.get('family') === '1';
const ASSIGNMENT = FAMILY ? 'family-lmr-process' : 'lmr-process-mode';
const STUDENT = `pm-student-${params.get('run') || 'a'}`;

const board = (questionId, prompt, source, extra = {}) => ({
  questionId,
  standard: 'A.3B',
  alignments: [{ framework: 'teks', code: 'A.3B', role: 'primary' }],
  type: 'representationBridge',
  mode: 'linearMultipleRepresentations',
  interactionMode: 'process',
  studentActions: ['connectLinearRepresentations'],
  difficultyBand: 2,
  dok: 2,
  prompt,
  source,
  feedbackTiming: 'guided',
  ...extra,
});

const PROCESS_ASSIGNMENT = {
  schemaVersion: 5,
  assignment: { title: 'Process Mode boards', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [
    {
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork — establish the facts, then build',
      feedbackMode: 'immediate',
      hintsAllowed: true,
      attemptsAllowed: 3,
      questions: [
        board('pm-standard', 'Establish the key facts about this line, then build its other representations.', { kind: 'standardForm', equation: '2x - 4y = 12' }),
        board('pm-slope-intercept', 'Read what the equation shows, find what it hides, then build.', { kind: 'slopeIntercept', equation: 'y = -x + 4' }),
        board('pm-point-slope', 'Establish the key facts about this line, then build.', { kind: 'pointSlope', equation: 'y - 2 = -1(x - 3)' }),
        board('pm-two-points', 'Two points are given. Establish the slope and intercepts, then build.', { kind: 'twoPoints', points: [[-2, -5], [4, -2]] }),
        board('pm-table', 'Establish the key facts from the table, then build.', { kind: 'table', rows: [{ x: 1, y: -1 }, { x: 2, y: 1 }, { x: 3, y: 3 }, { x: 4, y: 5 }] }),
        board('pm-graph', 'Establish the key facts from the graph, then build.', { kind: 'graph', points: [[0, 1], [3, -1]] }),
        board('pm-fraction', 'Read the slope and y-intercept exactly, then build.', { kind: 'slopeIntercept', equation: 'y = -(3/4)x' }, {
          requiredCards: ['slope', 'yIntercept', 'pointSlope', 'graphSlopeIntercept'],
        }),
        board('pm-scenario', 'Read the situation, establish the facts, then build.', {
          kind: 'scenario',
          prompt: 'A tank holds 24 liters of water. It drains at a steady rate of 3 liters every minute until it is empty.',
          m: -3,
          b: 24,
        }, {
          requiredCards: ['slope', 'yIntercept', 'xIntercept', 'slopeIntercept', 'standardForm', 'graphSlopeIntercept'],
          graphBounds: { xMin: -2, xMax: 10, yMin: -4, yMax: 28 },
        }),
      ],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL — Process Mode, outcomes withheld',
      feedbackMode: 'afterAssignmentSubmit',
      hintsAllowed: false,
      attemptsAllowed: 1,
      questions: [
        board('pm-dol', 'Establish the key facts about this line, then build. Submit once.', { kind: 'standardForm', equation: '3x + 2y = 6' }, {
          feedbackTiming: 'submitOnly',
          requiredCards: ['slope', 'xIntercept', 'yIntercept', 'slopeIntercept', 'graphIntercepts'],
        }),
      ],
    },
  ],
};

const compile = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  if (!model.isValid) throw new Error(`Preflight rejected the assignment:\n${model.errors.join('\n')}`);
  const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
  return { sections: rebuildV5SectionsFromQuestions(model.assignmentV5, questions), preflight: model };
};

const compiled = compile(FAMILY ? FAMILY_TEXT : JSON.stringify(PROCESS_ASSIGNMENT));
const generationKeyFor = (question) => `${ASSIGNMENT}|${STUDENT}|${question.questionId}|variant:0`;
const allQuestions = compiled.sections.flatMap((section) => section.questions.map((question, index) => ({ section, question, index })));

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
            {entry.question.questionId.replace(/^pm-|^lmr-/, '')}
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

window.__pm = {
  go: (questionId) => {
    const flat = allQuestions.findIndex((entry) => entry.question.questionId === questionId);
    if (flat === -1) return false;
    current = flat;
    notify();
    return true;
  },
  work: (questionId) => {
    const flat = allQuestions.findIndex((entry) => entry.question.questionId === questionId);
    if (flat === -1) return null;
    try { return JSON.parse(window.localStorage.getItem(`${draftKeyFor(flat)}:work:tool`))?.value ?? null; } catch { return null; }
  },
  grades: () => [...grades],
  questionIds: () => allQuestions.map((entry) => entry.question.questionId),
  // The version QuestionEngine shows this student: the same three calls, in order.
  delivered: (questionId) => {
    const question = allQuestions.find((entry) => entry.question.questionId === questionId)?.question;
    if (!question) return null;
    return normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(question, { serverGraded: false }), generationKeyFor(question), {}, null, null));
  },
  preflight: () => ({ isValid: compiled.preflight.isValid, errors: compiled.preflight.errors, warnings: compiled.preflight.warnings }),
};

createRoot(document.getElementById('root')).render(<Harness />);
