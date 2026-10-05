/*
 * THE SYSTEMS WORKSPACE, EVERY MODE, MOUNTED THE WAY A STUDENT MEETS IT.
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort
 *   open http://127.0.0.1:5199/tests/browser/systemsWorkspaceStudio.html?q=rewrite
 *
 *   ?q=<fixture>                   one of FIXTURES below (default rewrite)
 *   ?role=practice|dol|quiz|test   the activity policy (default practice)
 *   ?theme=dark                    the dark theme
 *   ?run=<id>                      a fresh draft namespace (default: one per
 *                                  fixture and role, so a reload restores work)
 *
 * Each fixture goes through the real QuestionEngine, as App.jsx mounts a
 * student's question: a per-question draft key, the activity role's feedback
 * policy and the platform's own Submit. Driven by systemsWorkspaceStudio.mjs.
 * What the engine hands its host lands on window.__mmGraded.
 */
import React from 'react';
import { MathfieldElement } from 'mathlive';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const which = params.get('q') || 'rewrite';
const run = params.get('run') || `${which}-${role}`;
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';

const sw = (fields) => ({ type: 'systemsWorkspace', ...fields });

export const FIXTURES = {
  // The full student-build workflow: rewrite each inequality into
  // slope-intercept form, build both boundaries, style and shade them, then
  // reason about the overlap (the V5 authoring round-trip fixture).
  rewrite: () => sw({
    questionId: 'studio-rewrite',
    mode: 'inequalities',
    prompt: 'Rewrite each inequality, then graph the system.',
    sourceConstraints: ['x - y >= -1', '3x - y <= 4'],
    expectedConstraints: [
      { A: 1, B: -1, C: 1, relation: '>=' },
      { A: 3, B: -1, C: -4, relation: '<=' },
    ],
    studentBuild: { rewrite: true, boundary: true, lineStyle: true, shading: true },
    reasoning: { boundaryProbe: true },
    testPoint: { x: 0, y: 0 },
    allowStudentTestPoint: true,
    askClassification: true,
    askVertices: true,
    graph: { xMin: -5, xMax: 5, yMin: -6, yMax: 6 },
  }),
  // Slope-intercept constraints, built and shaded, then classified.
  build: () => sw({
    questionId: 'studio-build',
    mode: 'inequalities',
    prompt: 'Graph the system y ≥ x + 1 and y < −0.5x + 6. Then classify the solution region.',
    inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }],
    studentBuild: { boundary: true, lineStyle: true, shading: true },
    reasoning: { classifyRegion: true },
    graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
  }),
  // A vertical and a horizontal boundary (the assessment-integrity fixture).
  axis: () => sw({
    questionId: 'studio-axis',
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
  // A bounded triangle whose corners the student finds and judges.
  vertices: () => sw({
    questionId: 'studio-vertices',
    mode: 'inequalities',
    prompt: 'Graph the system y ≥ 0, x > 0 and y ≤ −x + 4, then find every vertex of the region.',
    inequalities: [{ m: 0, b: 0, relation: '>=' }, { orientation: 'vertical', x: 0, relation: '>' }, { m: -1, b: 4, relation: '<=' }],
    studentBuild: { boundary: true, lineStyle: true, shading: true },
    reasoning: { classifyRegion: true, vertices: true, testPoint: true },
    graph: { xMin: -2, xMax: 6, yMin: -2, yMax: 6 },
  }),
  // A context the student models before graphing.
  modeling: () => sw({
    questionId: 'studio-modeling',
    mode: 'inequalities',
    prompt: 'A club sells x adult tickets and y student tickets. It can sell at most 10 tickets, and needs at least 2 adult tickets. Write the constraints, then graph them.',
    modeling: {
      variables: [{ symbol: 'x', label: 'adult tickets' }, { symbol: 'y', label: 'student tickets' }],
      expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }, { A: 1, B: 0, C: -2, relation: '>=' }],
    },
    studentBuild: { boundary: true, lineStyle: true, shading: true },
    graph: { xMin: -2, xMax: 12, yMin: -2, yMax: 12 },
  }),
  // My Math Path's construct form (A2.3F): typed boundary points, chosen style
  // and side. The most common inequality question in the Path bank.
  construct: () => sw({
    questionId: 'studio-construct',
    mode: 'inequalities',
    interaction: 'construct',
    ask: ['construction'],
    prompt: 'Solve the system by constructing both inequality graphs and shading ONLY their overlap: $y\\ge 2x-3$ and $y\\le -x+6$.',
    inequalities: [{ m: 2, b: -3, relation: '>=' }, { m: -1, b: 6, relation: '<=' }],
    graph: { xMin: -6, xMax: 6, yMin: -10, yMax: 12 },
  }),
  // My Math Path's analyze form: judge a marked point, then find one.
  analyze: () => sw({
    questionId: 'studio-analyze',
    mode: 'inequalities',
    prompt: 'Is the point (1, 2) a solution of the system y > x − 2 and y ≤ −2x + 6? Then name a solution of your own.',
    inequalities: [{ m: 1, b: -2, relation: '>' }, { m: -2, b: 6, relation: '<=' }],
    testPoint: { x: 1, y: 2 },
    graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
  }),
  linear: () => sw({
    questionId: 'studio-linear',
    mode: 'linear',
    prompt: 'Solve the system y = 2x − 1 and y = −x + 5 by graphing.',
    system: { m1: 2, b1: -1, m2: -1, b2: 5 },
  }),
  linearQuadratic: () => sw({
    questionId: 'studio-linear-quadratic',
    mode: 'linearQuadratic',
    prompt: 'Where does the line y = x + 1 meet the parabola y = x² − 1?',
    linearQuadratic: { line: { m: 1, b: 1 }, quadratic: { a: 1, b: 0, c: -1 } },
  }),
  matrix: () => sw({
    questionId: 'studio-matrix',
    mode: 'matrix',
    prompt: 'Solve the system represented by the augmented matrix.',
    matrix: { a11: 2, a12: 1, b1: 7, a21: 1, a22: -1, b2: -1 },
  }),
  algebraic: () => sw({
    questionId: 'studio-algebraic',
    prompt: 'Solve the system algebraically.',
    studentActions: ['solveSystem'],
    equations: ['2x + y = 7', 'x - y = -1'],
    variables: ['x', 'y'],
    requireVerification: true,
  }),
  spatial: () => sw({
    questionId: 'studio-spatial',
    mode: 'spatial',
    prompt: 'Explore the three planes, then classify the system.',
    equations: ['x + y + z = 6', 'x - y + z = 2', '2x + y - z = 1'],
    variables: ['x', 'y', 'z'],
  }),
};

const question = FIXTURES[which]?.();
window.__mmGraded = [];
window.__mmFixture = { role, which, questionId: question?.questionId || null };

const assignmentId = `systems-studio-${run}`;
const draftKey = buildQuestionDraftKey({ studentId: 'systems-studio-student', assignmentId, questionIndex: 0, variantIndex: 0, sessionMode: 'graded' });

function Harness() {
  if (!question) return <p role="alert">Unknown fixture {which}.</p>;
  return (
    <main className="mathmaster-question-stage" style={{ maxWidth: 1180, width: '100%', margin: '0 auto', padding: 10, boxSizing: 'border-box', background: 'var(--mm-surface)' }} data-studio-fixture={which} data-studio-role={role}>
      <QuestionEngine
        key={`${which}-${role}-${run}`}
        question={question}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        generationKey={`${assignmentId}|${which}`}
        activityRole={role}
        dolMode={role === 'dol'}
        maximumAttempts={3}
        draftKey={draftKey}
        assignmentId={assignmentId}
        executionScope="student"
        studentProfile={{}}
        onStepGrade={() => null}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey, extra) => {
          window.__mmGraded.push({ isCorrect, details, parts, responseKey, partialCreditPercent: extra?.partialCreditPercent ?? null });
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
