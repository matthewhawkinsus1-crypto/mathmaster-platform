// The classroom feedback ladder, mounted in the real QuestionEngine the way
// App.jsx mounts a student's question. Driven by tests/browser/feedbackTeaches.mjs.
//
//   ?role=practice|dol      the activity policy
//   ?q=multi|family|system  the fixture
//   ?support=translate      give the student Read aloud + Translate (Spanish)
//   ?support=read           give the student Read aloud only (a plan's text-to-speech)
//   ?q=plain                an item with no step written for it (HELP-19)
//   ?support=inclusion      an inclusion student, with Read aloud (the "Let's back up" step)
//   ?q=matrices             the real ACT-style matrices item of Algebra II M1 T2 L3
//                           (tests/browser/readAloudTranslate.mjs)
//   ?q=dolgraph             the real District DOL #1 graph-analysis item (q_section-4_4_1),
//                           a graph and its composed steps (readAloudTranslate.mjs: the
//                           graph is read without positions while it can be answered)
//   ?q=dolgraph7            q_section-4_4_4: seven steps, only the one on screen is read
//   ?q=table                the real fillable table of Algebra I M2 T2 L2 (l2-cw-9):
//                           its given cells are read, a cell to fill in is "blank"
//   ?q=planes               the real three-planes Systems Workspace item 3x3-d1-cw-1:
//                           no family reads it, so its "Let's back up" step is
//                           built from the tool's structure (readAloudTranslate.mjs)
//   ?q=dolgraphes           q_section-4_4_1 with an authored Spanish prompt, as a
//   ?q=planeses             teacher writes one (translations.es), and 3x3-d1-cw-1
//                           the same way: with ?support=translate Read aloud reads
//                           in Spanish, a figure in its own Spanish words or in
//                           English with a sentence saying so (AX05)
//   ?q=ltw|dml|sequence     the real DOL #3 review's tools that draw their own
//                           tables (dol3-review-q03, q11, q13), and the Linear
//   ?q=lmrtable             Multiple Representations board's given table (lmr-pr-1):
//                           Read aloud reads each table as drawn (AX10)
//   ?run=<id>               a fresh draft namespace
//   ?secure=1               mount it the way a secure Test item is mounted:
//                           server-graded (RichQuestionRuntime), and still
//                           handed an onAskTeacher callback
//
// Graded submissions land on window.__mmGrades, "Ask my teacher" toggles on
// window.__mmHelp.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';
import { emptyQuestionRecord, recordQuestionAttempt } from '../../src/attemptPolicy.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import day2Transformations from '../../teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json';
import matricesLesson from '../../teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json';
import dolGraphLesson from '../../teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json';
import transformationsLesson from '../../teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json';
import threeByThreeDay1 from '../../docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json';
import dol3Review from '../../teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json';
import linearRepresentationsLesson from '../../docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const which = params.get('q') || 'multi';
const run = params.get('run') || 'manual';
const policy = getEffectiveActivityPolicy(role);
const maximumAttempts = policy.attempts;
const assignmentId = `feedback-teaches-${which}`;
const lessonItem = (lesson, questionId) => compileAuthoringIntentV5(lesson).package.sections
  .flatMap((section) => section.questions)
  .find((entry) => entry.questionId === questionId);
// An authored Spanish prompt, the way a teacher writes one with the item: the
// screen shows it, and Read aloud reads the question in Spanish (AX05).
const withSpanishPrompt = (question, prompt) => ({ ...question, translations: { es: { prompt } } });

const QUESTIONS = {
  multi: {
    questionId: 'feedback-multi',
    type: 'multiAnswer',
    prompt: 'A line passes through (1, 2) and (5, 5). Find its slope.',
    answerFields: [{ id: 'slope', label: 'Slope', answer: '3/4', inputProfile: 'text' }],
    supportHints: ['Slope is the change in y divided by the change in x between the two points.', 'Subtract the coordinates in the same order: second point minus first point, on the top and on the bottom.'],
    solutionReview: {
      headline: 'Slope compares the change in y with the change in x.',
      reasoning: ['Change in y: 5 − 2 = 3.', 'Change in x: 5 − 1 = 4.', 'Slope = 3/4.'],
      answerSummary: 'The slope is 3/4.',
    },
  },
  family: {
    questionId: 'feedback-family',
    type: 'multiAnswer',
    activityRole: 'classwork',
    questionFamily: { id: 'linear.twoStepEquation', version: 1, tool: 'multiAnswer' },
  },
  // Student push J: the families job A left as stubs.
  vertex: {
    questionId: 'feedback-vertex',
    type: 'multiAnswer',
    activityRole: 'classwork',
    questionFamily: { id: 'quadratics.identifyVertex', version: 1, tool: 'multiAnswer' },
  },
  absval: {
    questionId: 'feedback-absval',
    type: 'multiAnswer',
    activityRole: 'classwork',
    questionFamily: { id: 'absoluteValue.solveEquation', version: 1, tool: 'multiAnswer' },
  },
  // The first transformation description the transformations family claims
  // in the Algebra II Day 2 lesson, compiled as a classroom receives it.
  transform: compileAuthoringIntentV5(day2Transformations).package.sections
    .flatMap((section) => section.questions)
    .find((entry) => entry.type === 'multiAnswer' && familyFor(entry)?.family === 'transformations'),
  matrices: compileAuthoringIntentV5(matricesLesson).package.sections
    .flatMap((section) => section.questions)
    .find((entry) => entry.questionId === 'l3m-pr-12-ccmr'),
  dolgraph: compileAuthoringIntentV5(dolGraphLesson).package.sections
    .flatMap((section) => section.questions)
    .find((entry) => entry.questionId === 'q_section-4_4_1'),
  // Seven steps, a later one marking the graph (review B1: a hidden step's
  // figure must not be read).
  dolgraph7: compileAuthoringIntentV5(dolGraphLesson).package.sections
    .flatMap((section) => section.questions)
    .find((entry) => entry.questionId === 'q_section-4_4_4'),
  table: compileAuthoringIntentV5(transformationsLesson).package.sections
    .flatMap((section) => section.questions)
    .find((entry) => entry.questionId === 'l2-cw-9'),
  planes: compileAuthoringIntentV5(threeByThreeDay1).package.sections
    .flatMap((section) => section.questions)
    .find((entry) => entry.questionId === '3x3-d1-cw-1'),
  dolgraphes: withSpanishPrompt(lessonItem(dolGraphLesson, 'q_section-4_4_1'), 'La gráfica muestra una función con un conjunto restringido de entradas. Determina su dominio y su rango con desigualdades.'),
  planeses: withSpanishPrompt(lessonItem(threeByThreeDay1, '3x3-d1-cw-1'), 'Con tu maestro, gira el modelo 3D y muestra u oculta los tres planos. Antes de que se revelen las coordenadas, decide qué debe representar una solución de las tres ecuaciones.'),
  ltw: lessonItem(dol3Review, 'dol3-review-q03'),
  dml: lessonItem(dol3Review, 'dol3-review-q11'),
  sequence: lessonItem(dol3Review, 'dol3-review-q13'),
  lmrtable: lessonItem(linearRepresentationsLesson, 'lmr-pr-1'),
  // No question family claims it and it has no authored scaffold: no step is
  // written for it (HELP-19, readAloudTranslate.mjs).
  plain: {
    questionId: 'feedback-plain',
    type: 'multiAnswer',
    prompt: 'Matrix A has 3 rows and 4 columns. How many entries does it have?',
    answerFields: [{ id: 'n', label: 'Entries', answer: '12', inputProfile: 'text' }],
  },
  system: {
    questionId: 'feedback-system',
    type: 'system',
    prompt: 'Solve the system: y = x + 1 and y = -x + 5.',
    equations: ['y = x + 1', 'y = -x + 5'],
    solution: [2, 3],
  },
};
const question = QUESTIONS[which];
const FAMILY_INSTANCES = new Set(['family', 'vertex', 'absval']);
// The question's own answers, for the driver's leak check (never rendered).
window.__mmAnswers = which === 'transform' ? (question?.answerFields || []).map((field) => String(field.answer ?? ''))
  : which === 'table' ? Object.values(question?.table?.answers || {}).map(String) : [];
const SUPPORT_PROFILES = {
  translate: { accommodations: ['text-to-speech', 'translation'], translationLanguage: 'es' },
  read: { accommodations: ['text-to-speech'] },
  // An inclusion student with a plan's Read aloud: the "Let's back up" step (HELP-19).
  inclusion: { inclusionStatus: true, accommodations: ['text-to-speech'] },
};
const studentProfile = SUPPORT_PROFILES[params.get('support')] || {};

window.__mmGrades = [];
window.__mmHelp = [];

const serverGrading = params.get('secure') === '1' ? {
  pathToolId: null,
  submit: async () => {
    window.__mmGrades.push({ server: true });
    return { isCorrect: false, status: 'attempted', attemptCount: 1, remainingAttempts: 0, message: 'Your answer is recorded.' };
  },
} : null;

function Harness() {
  const [record, setRecord] = useState(emptyQuestionRecord());
  const [help, setHelp] = useState(false);
  const onGrade = async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
    window.__mmGrades.push({ isCorrect, parts, supportUsage, responseKey });
    const outcome = recordQuestionAttempt({ record, isCorrect, questionDetails: details, parts, supportUsage, responseKey, partialCreditPercent: meta?.partialCreditPercent, maximumAttempts });
    setRecord(outcome.record);
    return outcome.result;
  };
  return (
    <div className="mathmaster-assignment-screen" data-feedback-fixture={which} data-feedback-role={role} style={{ fontFamily: '"Segoe UI", sans-serif', minHeight: '100vh', padding: 12 }}>
      {/* The shell App.jsx renders around a question. On a phone it is a
          two-row grid, the navigator and then the question filling the rest of
          the screen, and the work area scrolls inside that. Without it the
          stage took its content's height, the phone work area collapsed to a
          strip, and what a submit puts inside it (RUN-1) could not be reached. */}
      <div className="mathmaster-assignment-shell" style={{ maxWidth: 1120, margin: '0 auto' }}>
        <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className="mathmaster-assignment-unified-nav" aria-label="Assignment questions" style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: '#174ea6', color: '#fff', fontWeight: 800, fontSize: 12 }}>Q1</span>
        </nav>
      <main className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: 12, padding: 10 }}>
        <QuestionEngine
          question={question}
          questionRecord={record}
          maximumAttempts={maximumAttempts}
          activityRole={role}
          dolMode={role === 'dol'}
          generationKey={`${assignmentId}|student-a|0|variant:0`}
          familyContext={FAMILY_INSTANCES.has(which) ? { assignmentId, storageIndex: 0, variant: 0, allocation: { seat: 3, variant: 0, stride: 40, index: 3, basis: 'seated' } } : null}
          draftKey={`feedback-teaches-${role}-${which}-${run}`}
          assignmentId={assignmentId}
          executionScope="student"
          studentProfile={studentProfile}
          onGrade={onGrade}
          serverGrading={serverGrading}
          // The delivered family instance's own prompt, as plain text: the page
          // text also carries each formula's spoken form.
          onFamilyDelivery={(delivery, delivered) => {
            window.__mmFamilyPrompt = String(delivered?.prompt || '');
            window.__mmAnswers = (delivered?.answerFields || []).map((field) => String(field.answer ?? ''));
          }}
          onAskTeacher={(requested) => { window.__mmHelp.push(requested); setHelp(requested); }}
          // ?next=1: a way on, as App.jsx gives a question with one after it
          // (tests/browser/closedQuestionEnter.mjs counts the presses).
          onNextQuestion={params.get('next') === '1' ? () => { window.__mmAdvanced = (window.__mmAdvanced || 0) + 1; } : null}
          helpRequested={help}
        />
      </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
