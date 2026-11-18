/*
 * THE FIRST OPERAND ON A FRESH STEP ALGEBRA STAGE (issue #386 R12), AND ENTER
 * IN A COMPOSED QUESTION'S STEPS (#386 R5), in the real QuestionEngine, the
 * real Step Algebra solver and the real workflow runner. Driven by
 * tests/browser/stepAlgebraFirstOperand.mjs and, for `?scene=enter`,
 * tests/browser/workflowStepEnter.mjs.
 *
 *   ?scene=plain     a Step Algebra question, 5x = 35, opened with no draft
 *   ?scene=cancel    x + 4 − 4 = 9: a pair to cancel on the left side with no
 *                    operation in hand (?scene=cancelRight: x = 9 + 4 − 4)
 *   ?scene=steps     a composed question of four steps (one shown at a time):
 *                    write the equation, solve it on the balance workspace
 *                    (the equation is the student's own, from step 1), then
 *                    two written steps. The balance step mounts when the
 *                    student reaches it with Next step.
 *   ?scene=list      the same first two steps alone: both on screen, the
 *                    balance step waiting for step 1 and mounting on its answer
 *   ?scene=enter     five steps (one shown at a time) with a box in every
 *                    kind of typed step: an equation, the balance workspace,
 *                    a set of values, a point and a written answer
 *   ?run=<id>        the draft key: a fresh stage for every run;
 *                    window.__fresh() mounts another fresh one in place
 *
 * What the engine asks the host for is counted: window.__grades (a Submit),
 * window.__steps (a Step Algebra step), window.__confirms (a Start over or a
 * Reset asks before it clears anything; the harness answers no).
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene') || 'plain';
const run = params.get('run') || 'a';

const STEP_PAIR = [
  { id: 'model', kind: 'equationInput', prompt: 'Five times a number is 35. Write an equation for it, using x for the number.' },
  { id: 'solve', kind: 'algebraWorkspace', prompt: 'Solve your equation on the balance.', source: { fromStage: 'model' } },
];

const QUESTIONS = {
  plain: { questionId: 'r12-plain', type: 'stepAlgebra', prompt: 'Solve for x.', equation: '5x = 35', solveFor: 'x', activityRole: 'classwork' },
  // A pair to cancel with no operation in hand: on the left side, and on the right.
  cancel: { questionId: 'r12-cancel', type: 'stepAlgebra', prompt: 'Solve for x.', equation: 'x + 4 - 4 = 9', solveFor: 'x', activityRole: 'classwork' },
  cancelRight: { questionId: 'r12-cancel-right', type: 'stepAlgebra', prompt: 'Solve for x.', equation: 'x = 9 + 4 - 4', solveFor: 'x', activityRole: 'classwork' },
  steps: {
    questionId: 'r12-steps',
    type: 'workflow',
    prompt: 'Five times a number is 35. Write an equation, solve it, and say what the answer means.',
    activityRole: 'classwork',
    workflow: [
      ...STEP_PAIR,
      { id: 'meaning', kind: 'shortResponse', prompt: 'What does your value of x mean here?' },
      { id: 'check', kind: 'shortResponse', prompt: 'How could you check it?' },
    ],
  },
  list: {
    questionId: 'r12-list',
    type: 'workflow',
    prompt: 'Five times a number is 35. Write an equation, then solve it.',
    activityRole: 'classwork',
    workflow: STEP_PAIR,
  },
  enter: {
    questionId: 'r5-enter',
    type: 'workflow',
    prompt: 'Five times a number is 35. Write an equation, solve it, and use the answer.',
    activityRole: 'classwork',
    workflow: [
      ...STEP_PAIR,
      { id: 'values', kind: 'valueSet', prompt: 'Which value of x makes your equation true? Write it as a set.' },
      { id: 'point', kind: 'pointInput', prompt: 'The point (x, 35) is on the line y = 5x. Write it.', allowNone: false },
      { id: 'meaning', kind: 'shortResponse', prompt: 'What does your value of x mean here?' },
    ],
  },
};
const question = QUESTIONS[scene] || QUESTIONS.plain;

window.__grades = [];
window.__steps = [];
window.__confirms = [];
window.confirm = (text) => { window.__confirms.push(String(text || '')); return false; };

const onGrade = async (isCorrect) => {
  window.__grades.push({ at: Date.now(), isCorrect: Boolean(isCorrect) });
  return { isCorrect: Boolean(isCorrect), status: isCorrect ? 'correct' : 'attempted', attemptCount: window.__grades.length, remainingAttempts: Math.max(0, 3 - window.__grades.length) };
};
const onStepGrade = async (payload) => {
  window.__steps.push({ at: Date.now(), label: payload?.stepGrade?.label || null });
  return { recorded: true };
};

// Another fresh stage without a reload: the next question in a lesson is a new
// QuestionEngine with a draft key of its own, mounted on a warm page.
function Harness() {
  const [mount, setMount] = useState(0);
  window.__fresh = () => setMount((value) => value + 1);
  const id = `${run}-${mount}`;
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }} data-question-stage data-mount={mount}>
      <QuestionEngine
        key={id}
        question={question}
        questionRecord={{ status: 'unattempted', attemptCount: 0, totalAttempts: 0, variantIndex: 0 }}
        generationKey={`r12|${scene}|${id}`}
        onGrade={onGrade}
        onStepGrade={onStepGrade}
        studentProfile={{}}
        activityRole={question.activityRole}
        maximumAttempts={3}
        draftKey={buildQuestionDraftKey({ studentId: 'harness-r12', assignmentId: `r12-${scene}-${id}`, questionIndex: 0 })}
        assignmentId={`r12-${scene}-${id}`}
        executionScope="student"
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
