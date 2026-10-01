// One question in the real QuestionEngine, for tests/browser/unansweredChoiceGates.mjs.
//
//   ?q=<fixture>        which tool / mode (FIXTURES below)
//   ?role=practice|dol  the activity policy (default practice)
//   ?run=<id>           the draft namespace: the same run on a reload restores
//                       the student's work; a new run starts blank
//
// Every graded attempt lands in window.__mmGraded. All data is synthetic.
import React from 'react';
import { MathfieldElement } from 'mathlive';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey, readQuestionDraft, writeQuestionDraft } from '../../src/questionDraftStorage.js';
import { toolDraftKey } from '../../src/tools/shared/usePersistentToolState.js';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const which = params.get('q') || 'systems-linear';
const run = params.get('run') || 'manual';

// Questions whose right answer is the choice each tool used to open on, or,
// for a yes / no judgment, "no" — the answer a blank used to be read as.
const FIXTURES = {
  // r = 1: positive and strong. The lab opened on "Positive".
  'data-correlation': { type: 'dataModelingLab', mode: 'correlation', prompt: 'Calculate and interpret the correlation coefficient.', points: [[1, 3], [2, 5], [3, 7], [4, 9]], correlationTolerance: 0.02 },
  // Every judgment the full lab asks: association, model family, prediction type.
  'data-full': { type: 'dataModelingLab', mode: 'full', prompt: 'Model the data, then reason about it.', points: [[1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1]], predictionX: 3.5, expectedModel: 'linear' },
  // One solution at (2, 5). The workspace opened on "Exactly one solution".
  'systems-linear': { type: 'systemsWorkspace', mode: 'linear', prompt: 'Classify the system, then solve it.', system: { m1: 2, b1: 1, m2: -1, b2: 7 } },
  // x = 1, y = 2, z = 3.
  'systems-matrix3': { type: 'systemsWorkspace', mode: 'matrix3', prompt: 'Use RREF technology, then interpret it.', matrix: { rows: [[1, 1, 1, 6], [1, -1, 1, 2], [2, 1, -1, 1]] } },
  // y ≥ x and y < -x + 4. The marked point (5, 1) is OUTSIDE: the right answer
  // is "no", which a blank choice used to be read as.
  'inequality-analyze': { type: 'systemsWorkspace', mode: 'inequalities', prompt: 'Test the marked point, then find a point of your own.', inequalities: [{ m: 1, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<' }], testPoint: { x: 5, y: 1 } },
  'inequality-construct': { type: 'systemsWorkspace', mode: 'inequalities', prompt: 'Graph the system.', interaction: 'construct', inequalities: [{ m: 1, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<' }] },
  // x + y ≤ 10 from a context: the relation is the student's symbol to choose.
  'inequality-modeling': { type: 'systemsWorkspace', mode: 'inequalities', prompt: 'Write the constraint, then graph it.', modeling: { variables: [{ symbol: 'x', label: 'adult tickets' }, { symbol: 'y', label: 'student tickets' }], expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }] }, studentBuild: { boundary: true, lineStyle: true, shading: true } },
  // A linear f needs no restriction: the lab opened on "No restriction needed"
  // and, for a function that is not a quadratic, did not show the choice at all.
  'inverse-restriction-linear': { type: 'inverseCompositionLab', mode: 'restriction', prompt: 'Decide whether f needs a restriction, then undo it.', f: { type: 'linear', a: 2, h: 0, k: 1 }, x: 3 },
  // P = (6, 1) is not on (x − 0)² = 4·2(y − 0): "no" is right.
  'parabola-equidistance': { type: 'parabolaGeometryLab', mode: 'equidistance', prompt: 'Is P on the parabola?', h: 0, k: 0, p: 2, point: [6, 1] },
  // Opens up: the lab opened on "up".
  'parabola-equation': { type: 'parabolaGeometryLab', mode: 'equation', prompt: 'Read the standard form.', h: -2, k: 1, p: 1.5, orientation: 'vertical' },
  // P(1) = 2, so (x − 1) is NOT a factor: "no" is right.
  'polynomial-factor': { type: 'polynomialWorkshop', mode: 'factorZero', prompt: 'Is (x − 1) a factor?', coefficients: [1, -5, 6], candidateRoot: 1 },
  // A simple zero at 3 crosses; degree 3 with a positive lead: left falls, right rises.
  'polynomial-graph': { type: 'polynomialWorkshop', mode: 'graphConnection', prompt: 'Describe the graph.', roots: [{ root: -2, multiplicity: 2 }, { root: 3, multiplicity: 1 }], leadingCoefficient: 0.35, targetRoot: 3 },
  // x = 2 is a root of both: a hole, which the workshop opened on.
  'polynomial-rational': { type: 'polynomialWorkshop', mode: 'rationalFeatures', prompt: 'What happens at x = 2?', numeratorRoots: [2, -1], denominatorRoots: [2, 4], targetValue: 2 },
  // "Continuous" is asked: the builder opened on Continuous.
  'builder-continuity': {
    type: 'constraintFunctionBuilder', toolId: 'constraintFunctionBuilder',
    prompt: 'Build a continuous increasing linear function with a y-intercept of 2.',
    allowedFamilies: ['linear', 'quadratic'],
    constraints: [
      { id: 'continuity', kind: 'continuity', value: 'continuous', label: 'Continuous graph' },
      { id: 'y-intercept', kind: 'yIntercept', value: 2, label: 'y-intercept 2' },
    ],
  },
};

const question = FIXTURES[which] ? { questionId: `unanswered-${which}`, ...FIXTURES[which] } : null;
window.__mmGraded = [];
window.__mmFixture = { role, which, run };

const assignmentId = `unanswered-choice-${run}`;
const draftKey = buildQuestionDraftKey({ studentId: 'unanswered-choice-student', assignmentId, questionIndex: 0, variantIndex: 0, sessionMode: 'graded' });

// The tool's stored workspace record, so the driver can seed a draft saved
// before this change ("a student who chose Exactly one solution") and read
// back what a choice stored.
window.__mmToolDraft = {
  read: () => readQuestionDraft(toolDraftKey(draftKey), null),
  write: (record) => writeQuestionDraft(toolDraftKey(draftKey), record),
};

function Harness() {
  if (!question) return <p role="alert">Unknown fixture {which}.</p>;
  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: 12, fontFamily: 'system-ui' }} data-unanswered-fixture={which}>
      <QuestionEngine
        key={`${which}-${role}-${run}`}
        question={question}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        generationKey={`${assignmentId}|${which}`}
        activityRole={role}
        maximumAttempts={3}
        draftKey={draftKey}
        assignmentId={assignmentId}
        executionScope="student"
        studentProfile={{}}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey, extra) => {
          window.__mmGraded.push({ isCorrect, parts, responseKey, partialCreditPercent: extra?.partialCreditPercent ?? null });
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
