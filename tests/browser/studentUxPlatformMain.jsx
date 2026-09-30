// THE STUDENT UX PLATFORM PASS, ON THE SURFACE A STUDENT ACTUALLY GETS.
//
// One assignment that visits the representative tools the pass changed:
//
//   WU    Representation Match (the PR #397 warm-ups: two lines; two situations)
//   CW    Linear Multiple Representations board · Step Algebra · Graphing 2 ·
//         Linear Table Workbench (a −2/3 rate) · a three-part typed answer ·
//         a filled-in table
//   PR    one ordinary single-answer question
//   DOL   the PR #397 DOL board and a submit-only single answer
//
// Every question goes through the teacher import chain (parse -> preflight
// review -> preflight model -> validateAssignmentQuestions ->
// rebuildV5SectionsFromQuestions), because import recompiles by studentActions
// and a harness mounting raw JSON can pass while the published assignment is
// broken. It is mounted inside the same assignment-screen / shell / stage
// wrappers App.jsx uses, so the sticky task anchor, the sticky action bar and
// the phone layout are the real ones.
//
// Driven by tests/browser/studentUxPlatform.mjs.
//
// Two options added by the platform quirks audit (defaults unchanged):
//
//   ?identity=1   renders the real signed-in StudentIdentityBar above the
//                 assignment, as App.jsx's renderStudentIdentityShell does. It
//                 publishes --mm-student-identity-stack-offset, which the
//                 sticky task, the navigator, the phone container height and
//                 the scroll padding all subtract; without it every one of
//                 those was measured with an offset of 0.
//   ?tools=1      appends a "Tools" section with one question per registry
//                 tool (its sample spec, as the Work View certification mounts
//                 it), so any tool can be opened inside the real wrappers and a
//                 long navigation session can visit all of them.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import { listDraftSyncRejections } from '../../src/platform/persistence/draftSyncDiagnostics.js';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';
import StudentIdentityBar from '../../src/components/student/StudentIdentityBar.jsx';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import FINAL_TEXT from '../../docs/assignments/algebra1-linear-multiple-representations-final-v5.json?raw';
import '../../src/index.css';
import '../../src/App.css';

// Vite's dev optimizer moves mathlive into .vite/deps without its fonts.
MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const ASSIGNMENT = 'student-ux-platform-pass';
const STUDENT = `ux-student-${params.get('run') || 'a'}`;

const teks = (code) => ({ standard: code, alignments: [{ framework: 'teks', code, role: 'primary' }] });

const UX_PASS = {
  schemaVersion: 5,
  assignment: { title: 'Student UX platform pass', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [
    {
      id: 'ux-classwork',
      role: 'classwork',
      title: 'Classwork',
      feedbackMode: 'immediate',
      hintsAllowed: true,
      attemptsAllowed: 3,
      questions: [
        { questionId: 'ux-step', ...teks('A.5A'), prompt: 'Solve 3x − 5 = 10.', studentActions: ['solveStepByStep'], equation: '3x - 5 = 10', answer: 5 },
        { questionId: 'ux-graph2', ...teks('A.3C'), prompt: 'Graph the line y = −2x + 3.', studentActions: ['constructLine'], lineIntent: { m: -2, b: 3 } },
        {
          questionId: 'ux-ltw',
          ...teks('A.3B'),
          prompt: 'Show that the rate of change is constant, then write the equation of the line.',
          studentActions: ['proveConstantRate'],
          mode: 'deriveEquation',
          rows: [{ x: 0, y: 4 }, { x: 3, y: 2 }, { x: 6, y: 0 }, { x: 9, y: -2 }],
          requiredComparisons: 2,
        },
        {
          questionId: 'ux-multi',
          ...teks('A.3B'),
          prompt: 'A line passes through (0, 4) and (3, 2). Answer each part.',
          studentActions: ['multipleResponses'],
          responses: [
            { id: 'm', label: 'Slope', answer: '-2/3' },
            { id: 'b', label: 'y-intercept', answer: '4' },
            { id: 'x', label: 'x-intercept', answer: '6' },
          ],
        },
      ],
    },
    {
      id: 'ux-practice',
      role: 'practice',
      title: 'Practice',
      feedbackMode: 'immediate',
      hintsAllowed: true,
      attemptsAllowed: 3,
      questions: [
        {
          // The TABLE card kind (R-9): one table authored as Firestore-safe
          // rows, one computed from the set's own line with xValues.
          questionId: 'ux-rm-table',
          ...teks('A.3B'),
          prompt: 'Two situations are hiding in these cards. Sort every card into the situation it describes.',
          studentActions: ['connectRepresentations'],
          representations: {
            mode: 'linearConnections',
            task: 'group',
            cardKinds: ['context', 'slopeIntercept', 'slope', 'table', 'graph'],
            sets: [
              {
                id: 'plan',
                context: 'A phone plan costs $10 a month plus $2 for each gigabyte used.',
                slopeIntercept: 'y = 2x + 10',
                slope: 2,
                table: [{ x: 0, y: 10 }, { x: 1, y: 12 }, { x: 2, y: 14 }, { x: 3, y: 16 }],
                graphSpec: { type: 'linear', a: 2, h: 0, k: 10 },
              },
              {
                id: 'candle',
                context: 'A 20 cm candle burns down 3 cm every hour.',
                slopeIntercept: 'y = -3x + 20',
                slope: -3,
                table: { xValues: [0, 1, 2, 3] },
                graphSpec: { type: 'linear', a: -3, h: 0, k: 20 },
              },
            ],
            graphBounds: { xMin: 0, xMax: 6, yMin: 0, yMax: 24 },
          },
        },
        {
          questionId: 'ux-simple',
          ...teks('A.3A'),
          prompt: 'What is the slope of the line through (1, 2) and (4, 8)?',
          studentActions: ['multipleResponses'],
          responses: [{ id: 'm', label: 'Slope', answer: '2' }],
        },
      ],
    },
    {
      id: 'ux-dol',
      role: 'dol',
      title: 'DOL',
      feedbackMode: 'afterSubmit',
      attemptsAllowed: 1,
      questions: [
        {
          questionId: 'ux-dol-simple',
          ...teks('A.3A'),
          prompt: 'Write the slope of y = −3x + 7.',
          studentActions: ['multipleResponses'],
          responses: [{ id: 'm', label: 'Slope', answer: '-3' }],
        },
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

const finalCompiled = compile(FINAL_TEXT);
const passCompiled = compile(JSON.stringify(UX_PASS));
const pick = (sections, role, ids) => sections
  .filter((section) => section.role === role)
  .map((section) => ({ ...section, questions: section.questions.filter((question) => ids.includes(question.questionId)) }))
  .filter((section) => section.questions.length);

const WITH_IDENTITY = params.get('identity') === '1';
const toolSection = params.get('tools') === '1' ? [{
  id: 'ux-tools',
  role: 'classwork',
  title: 'Tools',
  feedbackMode: 'immediate',
  attemptsAllowed: 3,
  questions: TOOL_CATALOG_IDS.map((toolId) => ({
    questionId: `tool-${toolId}`,
    id: `tool-${toolId}`,
    type: toolId,
    prompt: `Complete the ${toolId} activity.`,
    ...SAMPLE_SPECS[toolId],
  })),
}] : [];

const sections = [
  ...pick(finalCompiled.sections, 'warmup', ['lmr-wu-1', 'lmr-wu-2']),
  ...pick(finalCompiled.sections, 'classwork', ['lmr-cw-2']),
  ...passCompiled.sections.filter((section) => section.role === 'classwork'),
  ...passCompiled.sections.filter((section) => section.role === 'practice'),
  ...pick(finalCompiled.sections, 'dol', ['lmr-dol-1']),
  ...passCompiled.sections.filter((section) => section.role === 'dol'),
  ...toolSection,
];
const allQuestions = sections.flatMap((section) => section.questions.map((question, index) => ({ section, question, index })));

const startId = params.get('q');
let current = Math.max(0, allQuestions.findIndex((entry) => entry.question.questionId === startId));
const listeners = new Set();
const notify = () => listeners.forEach((listen) => listen(current));
const go = (flat) => { current = flat; notify(); };

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
  const { section, question, index } = allQuestions[position];
  const draftKey = useMemo(() => draftKeyFor(position), [position]);
  const dol = section.role === 'dol';
  const next = position + 1 < allQuestions.length ? () => go(position + 1) : null;
  const screen = (
    // The same three wrappers App.jsx renders around a question, so the
    // stylesheet's assignment-screen rules (sticky anchor, action bar, scroll
    // padding, phone container) apply exactly as they do for a student.
    <div
      className="mathmaster-assignment-screen"
      style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh', padding: 20 }}
      data-question-id={question.questionId}
      data-section-role={section.role}
    >
      <div className="mathmaster-assignment-shell" style={{ maxWidth: 1120, margin: '0 auto' }}>
        {/* The real navigator's class and measured height, so the sticky task
            card starts where it does in App.jsx instead of under a guess. */}
        <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className="mathmaster-assignment-unified-nav" aria-label="Assignment questions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {allQuestions.map((entry, flat) => (
            <button
              key={entry.question.questionId}
              type="button"
              data-nav={entry.question.questionId}
              onClick={() => go(flat)}
              aria-current={flat === position ? 'step' : undefined}
              style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #b8cdf0', background: flat === position ? '#174ea6' : '#fff', color: flat === position ? '#fff' : '#174ea6', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
            >
              {`${tag(entry.section.role)} ${entry.index + 1}`}
            </button>
          ))}
        </nav>
        <main className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: 12, padding: 10, minHeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <QuestionEngine
            key={`${ASSIGNMENT}-${question.questionId}`}
            question={question}
            questionRecord={null}
            generationKey={`${ASSIGNMENT}|${STUDENT}|${question.questionId}|variant:0`}
            onGrade={(isCorrect, details, parts, _support, _responseKey, meta) => {
              grades.push({ questionId: question.questionId, isCorrect, details, parts, partialCreditPercent: meta?.partialCreditPercent ?? null, at: Date.now() });
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
            onNextQuestion={next}
            sectionLabel={`${tag(section.role)} ${index + 1}`}
          />
        </main>
      </div>
    </div>
  );
  if (!WITH_IDENTITY) return screen;
  // renderStudentIdentityShell in App.jsx: the identity bar is sticky at the
  // top of every authenticated student surface, above the navigator.
  return (
    <div data-authenticated-student-shell="student" style={{ minHeight: '100vh' }}>
      <StudentIdentityBar
        student={{ firstName: 'Claude', lastName: 'QA Student', classPeriod: '3' }}
        classPointsBalance={120}
        onLogout={() => {}}
      />
      {screen}
    </div>
  );
}

const readDrafts = (prefix) => {
  const drafts = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && key.includes(prefix)) {
      try { drafts[key] = JSON.parse(window.localStorage.getItem(key)); } catch { drafts[key] = window.localStorage.getItem(key); }
    }
  }
  return drafts;
};

window.__ux = {
  go: (questionId) => {
    const flat = allQuestions.findIndex((entry) => entry.question.questionId === questionId);
    if (flat === -1) return false;
    go(flat);
    return true;
  },
  ids: () => allQuestions.map((entry) => entry.question.questionId),
  drafts: () => readDrafts(`${STUDENT}:${ASSIGNMENT}`),
  work: (questionId) => {
    const flat = allQuestions.findIndex((entry) => entry.question.questionId === questionId);
    if (flat === -1) return null;
    try { return JSON.parse(window.localStorage.getItem(`${draftKeyFor(flat)}:work:tool`))?.value ?? null; } catch { return null; }
  },
  grades: () => [...grades],
  question: (questionId) => allQuestions.find((entry) => entry.question.questionId === questionId)?.question || null,
  draftRejections: () => listDraftSyncRejections(),
};

createRoot(document.getElementById('root')).render(<Harness />);
