// Every surface the assessment-integrity audit fixed, mounted in the real
// QuestionEngine under the activity role in the URL, the way App.jsx mounts a
// student's question. Driven by tests/browser/assessmentLeakGates.mjs.
//
//   ?role=practice|dol|quiz|test   the activity policy (default practice)
//   ?q=<fixture>                   one of FIXTURES below
//   ?run=<id>                      a fresh draft namespace for this run
//   ?released=1                    the teacher has released outcome feedback
//   ?record=partial|expired        the item's record: one half-right attempt, or
//                                  out of attempts
//   ?review=1                      the teacher has released the assignment's feedback
//
// What the engine hands its host lands on window: every graded submission in
// __mmGraded, every step-credit report in __mmStepGrades.
import React from 'react';
import { MathfieldElement } from 'mathlive';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { compileCapabilityFixture } from '../../src/platform/certification/capabilityFixtureRuntime.js';
import day2 from '../../docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const which = params.get('q') || 'systems-3x3';
const run = params.get('run') || 'manual';
const released = params.get('released') === '1';
const reviewReleased = params.get('review') === '1';

const day2Question = (id) => day2.sections.flatMap((section) => section.questions).find((question) => question.questionId === id);

const FIXTURES = {
  // Defect 1. Day 2 PR2: E1/E2 earns 0 = −3, which the student classifies
  // and then states how each pair of planes meets.
  'systems-3x3': () => day2Question('3x3-d2-pr-2'),
  // A 2×2 that eliminates to a statement with no variable (0 = −2).
  'systems-2x2': () => ({
    questionId: 'leak-gates-2x2-special',
    type: 'systemsWorkspace',
    prompt: 'Solve the system by elimination.',
    studentActions: ['solveSystem'],
    method: 'elimination',
    equations: ['x + y = 3', 'x + y = 5'],
    variables: ['x', 'y'],
    requireVerification: true,
  }),
  // A student-built system of inequalities: x ≥ 1 (solid, right) and y < 3
  // (dashed, below), every step built by the student.
  'inequality-build': () => ({
    questionId: 'leak-gates-inequality-build',
    type: 'systemsWorkspace',
    mode: 'inequalities',
    prompt: 'Graph the system x ≥ 1 and y < 3.',
    inequalities: [
      { orientation: 'vertical', x: 1, relation: '>=' },
      { orientation: 'horizontal', y: 3, relation: '<' },
    ],
    studentBuild: { boundary: true, lineStyle: true, shading: true },
    reasoning: { classifyRegion: true },
    graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
  }),
  // The same system, with the student's own test point and its boundary questions.
  'inequality-probe': () => ({
    questionId: 'leak-gates-inequality-probe',
    type: 'systemsWorkspace',
    mode: 'inequalities',
    prompt: 'Graph the system x ≥ 1 and y < 3, then test a point of your own.',
    inequalities: [
      { orientation: 'vertical', x: 1, relation: '>=' },
      { orientation: 'horizontal', y: 3, relation: '<' },
    ],
    studentBuild: { boundary: true, lineStyle: true, shading: true },
    reasoning: { testPoint: true, boundaryProbe: true },
    graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
  }),
  // Defect 2, compiled from authoring JSON like the capability fixture
  // xy-intercepts.
  intercepts: () => {
    const equation = params.get('eq') || 'x + y = 5';
    return compileCapabilityFixture({
      id: 'leak-gates-intercepts',
      standard: 'A.3C',
      authoring: { prompt: `Find the x- and y-intercepts of ${equation}.`, studentActions: ['interactiveAlgebra'], mode: 'linearIntercepts', equation },
    });
  },
  // The relation solver's "graph your solution" number line.
  relation: () => {
    const inequality = params.get('ineq') || '2x > 8';
    return {
      questionId: 'leak-gates-relation',
      type: 'stepAlgebra',
      prompt: `Solve ${inequality} and graph your solution.`,
      inequality,
      equation: inequality,
      solveFor: 'x',
      standard: 'A.5B',
      courseId: 'algebra1',
    };
  },
  // The Constraint-Based Function Builder's live checklist.
  'constraint-builder': () => ({
    questionId: 'leak-gates-constraint-builder',
    type: 'constraintFunctionBuilder',
    toolId: 'constraintFunctionBuilder',
    prompt: 'Build an increasing linear function with a y-intercept of 2.',
    allowedFamilies: ['linear', 'quadratic'],
    constraints: [
      { id: 'family', kind: 'family', value: 'linear', label: 'Linear function' },
      { id: 'behavior', kind: 'behavior', value: 'increasing', label: 'Increasing' },
      { id: 'y-intercept', kind: 'yIntercept', value: 2, label: 'y-intercept 2' },
    ],
  }),
  // A composed question whose first step is the balance workspace.
  'composed-algebra': () => ({
    questionId: 'leak-gates-composed-algebra',
    type: 'stepAlgebra',
    prompt: 'Solve 2x + 3 = 11, then say what your solution means.',
    workflow: [
      { id: 'solve', kind: 'algebraWorkspace', prompt: 'Solve 2x + 3 = 11.', equation: '2x + 3 = 11' },
      { id: 'explain', kind: 'shortResponse', prompt: 'What does your value of x make true?' },
    ],
  }),
  // Feedback that teaches (Student push, Job A): a plain multi-answer key
  // carrying every authored support the classroom ladder shows — hints, a
  // wrong-answer message, attempt feedback and a worked solution.
  'feedback-ladder': () => ({
    questionId: 'leak-gates-feedback-ladder',
    type: 'multiAnswer',
    prompt: 'A line passes through (1, 2) and (5, 5). Find its slope.',
    answerFields: [{ id: 'slope', label: 'Slope', answer: '3/4', inputProfile: 'text' }],
    supportHints: ['LEAKCHECK-HINT: the change in y over the change in x.'],
    hints: ['LEAKCHECK-HINT-2: subtract in the same order.'],
    attemptFeedback: ['LEAKCHECK-FEEDBACK: check the order of subtraction.'],
    misconceptions: [{ match: ['-3/4', '-\\frac{3}{4}'], message: 'LEAKCHECK-MISCONCEPTION: a sign was dropped.' }],
    solutionReview: { headline: 'LEAKCHECK-REVIEW headline', reasoning: ['LEAKCHECK-REVIEW: change in y is 3.'], answerSummary: 'LEAKCHECK-REVIEW: the slope is 3/4.' },
  }),
  // A Question Family instance: the server's classifier would name the miss.
  'feedback-family': () => ({
    questionId: 'leak-gates-feedback-family',
    type: 'multiAnswer',
    activityRole: 'classwork',
    questionFamily: { id: 'linear.twoStepEquation', version: 1, tool: 'multiAnswer' },
  }),
  // A registry tool with a review builder and a classifier.
  'feedback-tool': () => ({
    questionId: 'leak-gates-feedback-tool',
    type: 'relationMapping',
    toolId: 'relationMapping',
    prompt: 'Draw the mapping for the relation, then give its domain and range.',
    pairs: [[1, 4], [2, 5], [3, 6]],
    supportHints: ['LEAKCHECK-HINT: inputs are on the left.'],
  }),
  // Two graded parts, for the partial-credit breakdown (PR #462 review): the
  // record (?record=partial) has the slope right and the y-intercept wrong.
  'feedback-partial': () => ({
    questionId: 'leak-gates-feedback-partial',
    type: 'multiAnswer',
    prompt: 'A line passes through (0, 1) and (2, 5). Find its slope and its y-intercept.',
    answerFields: [
      { id: 'slope', label: 'LEAKCHECK-PART Slope', answer: '2', inputProfile: 'text' },
      { id: 'intercept', label: 'LEAKCHECK-PART y-intercept', answer: '1', inputProfile: 'text' },
    ],
  }),
  // A graph-READING item like District DOL #2 q03 (PR #454 review B1/B2): the
  // answer is the intercepts, read off a given line. `read=0` is the same graph
  // without readCoordinates.
  'graph-reading': () => ({
    questionId: 'leak-gates-graph-reading',
    type: 'multiAnswer',
    prompt: 'Identify the x-intercept and y-intercept. Enter each coordinate as (x, y).',
    answerFields: [
      { id: 'xIntercept', label: 'x-intercept (x, y)', correctAnswer: '(3,0)' },
      { id: 'yIntercept', label: 'y-intercept (x, y)', correctAnswer: '(0,2)' },
    ],
    stimulus: {
      kind: 'graph',
      graph: {
        xMin: -10, xMax: 10, yMin: -10, yMax: 10, xTickStep: 1, yTickStep: 1,
        readCoordinates: params.get('read') !== '0',
        ariaLabel: 'Graph with horizontal axis x and vertical axis y',
        lines: [{ points: [{ x: 0, y: 2 }, { x: 3, y: 0 }] }],
      },
    },
  }),
  // The three-plane model with an author-allowed reveal.
  'three-plane-reveal': () => ({
    questionId: 'leak-gates-three-plane',
    type: 'systemsWorkspace',
    mode: 'spatial',
    prompt: 'Explore the three planes, then classify the system.',
    equations: ['x + y + z = 6', 'x - y + z = 2', '2x + y - z = 1'],
    variables: ['x', 'y', 'z'],
    spatialModel: { allowSolutionReveal: true },
  }),
};

const question = FIXTURES[which]?.();
window.__mmGraded = [];
window.__mmStepGrades = [];
window.__mmFixture = { role, which, questionId: question?.questionId || null };

const RECORDS = {
  partial: {
    status: 'attempted',
    attemptCount: 1,
    bestPartialCredit: 50,
    partGrades: [
      { id: 'slope', label: 'LEAKCHECK-PART Slope', isCorrect: true },
      { id: 'intercept', label: 'LEAKCHECK-PART y-intercept', isCorrect: false },
    ],
  },
};
RECORDS.expired = { status: 'expired', attemptCount: 3 };
const questionRecord = RECORDS[params.get('record')] || { status: 'unattempted', attemptCount: 0 };

const assignmentId = `leak-gates-${run}`;
const draftKey = buildQuestionDraftKey({ studentId: 'leak-gates-student', assignmentId, questionIndex: 0, variantIndex: 0, sessionMode: 'graded' });

function Harness() {
  if (!question) return <p role="alert">Unknown fixture {which}.</p>;
  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: 12, fontFamily: 'system-ui' }} data-leak-fixture={which} data-leak-role={role}>
      <QuestionEngine
        key={`${which}-${role}-${run}`}
        question={question}
        questionRecord={questionRecord}
        generationKey={`${assignmentId}|${which}`}
        activityRole={role}
        feedbackReleased={released}
        assessmentReviewReleased={reviewReleased}
        maximumAttempts={3}
        draftKey={draftKey}
        assignmentId={assignmentId}
        executionScope="student"
        studentProfile={{}}
        onStepGrade={(payload) => { window.__mmStepGrades.push(JSON.parse(JSON.stringify(payload ?? null))); return null; }}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey, extra) => {
          window.__mmGraded.push({ isCorrect, details, parts, responseKey, partialCreditPercent: extra?.partialCreditPercent ?? null });
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
