// Review My Work in a real browser: the student's own answers beside the
// worked solutions, rendered by the REAL ReviewMyWork component, model and
// solution renderers, from rows shaped exactly like the loadMyReviewWork
// callable's (functions/lib/reviewMyWork.js). `load` is a local fake — this
// page never calls a server.
//
// HOW TO RUN: see tests/browser/reviewMyWork.mjs.
import React from 'react';
import { createRoot } from 'react-dom/client';
import ReviewMyWork from '../../src/components/student/ReviewMyWork.jsx';
import '../../src/index.css';
import '../../src/App.css';

const literal = { questionId: 'q-lit', type: 'literal', prompt: 'Simplify $3(x+2)-3x$.', acceptedAnswers: ['6'] };
const fieldsQuestion = {
  questionId: 'q-multi',
  type: 'multiAnswer',
  prompt: 'The line through $(0, 2)$ and $(4, 4)$: give its slope and its $y$-intercept.',
  answerFields: [
    { id: 'slope', label: 'Slope', acceptedAnswers: ['1/2'] },
    { id: 'intercept', label: 'y-intercept', acceptedAnswers: ['2'] },
  ],
};
const algebraTemplate = { questionId: 'q-alg', type: 'algebra', prompt: 'Solve the equation.', variantGenerator: { kind: 'linear' }, answer: 0 };
const algebraDelivered = { ...algebraTemplate, equation: '2x+1=7', equationLatex: '2x+1=7', answer: 3, generatedAnswer: 3 };
const sequence = { questionId: 'q-seq', toolId: 'sequenceExplorer', type: 'sequenceExplorer', prompt: 'Find the sum of the first five terms of $3, 6, 12, \\ldots$', mode: 'partialSum', kind: 'geometric', sequence: { first: 3, ratio: 2 }, sumN: 5 };
const generated = { questionId: 'q-gen', type: 'algebra', prompt: 'Solve for $x$.', variantGenerator: { kind: 'linear' }, answer: 0 };

const assignment = {
  id: 'asg-review',
  schemaVersion: 5,
  title: 'Linear Functions — Slope, Intercepts and Sequences',
  assignedClassIds: ['class-a'],
  sections: [
    { id: 'wu', role: 'warmup', title: 'Warm-Up', questions: [literal, fieldsQuestion] },
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [algebraTemplate, sequence, generated] },
  ],
};

const row = (index, question, extra) => ({
  index, questionId: question.questionId, sectionTitle: index < 2 ? 'Warm-Up' : 'Classwork', sectionRole: index < 2 ? 'warmup' : 'classwork',
  prompt: question.prompt, deliveredQuestion: null, solutionSource: 'assignment', submittedResponse: null, responseSource: null,
  outcome: 'notAnswered', credit: 0, teacherChanged: false, teacherReason: null, ...extra,
});

const result = {
  assignmentId: assignment.id,
  title: assignment.title,
  excused: false,
  assignmentChange: null,
  questions: [
    row(0, literal, { deliveredQuestion: literal, submittedResponse: { kind: 'value', type: 'literal', value: '6', fields: [] }, responseSource: 'submitted', outcome: 'correct', credit: 100 }),
    row(1, fieldsQuestion, {
      deliveredQuestion: fieldsQuestion,
      submittedResponse: { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'slope', value: '\\frac{1}{2}', isComplete: true }, { id: 'intercept', value: '', isComplete: false }] },
      responseSource: 'submitted', outcome: 'partial', credit: 50, teacherChanged: true, teacherReason: 'Partial credit awarded',
    }),
    row(2, algebraTemplate, { deliveredQuestion: algebraDelivered, solutionSource: 'delivered', submittedResponse: { kind: 'value', type: 'algebra', value: 'x=4', fields: [] }, responseSource: 'submitted', outcome: 'incorrect', credit: 0 }),
    row(3, sequence, { deliveredQuestion: sequence, submittedResponse: { kind: 'value', type: 'sequenceExplorer', value: { lastTerm: 48, sum: 93 }, fields: [] }, responseSource: 'submitted', outcome: 'correct', credit: 100 }),
    row(4, generated, { solutionSource: 'unavailable' }),
  ],
};

const SCENES = {
  ready: { load: () => new Promise((resolve) => setTimeout(() => resolve(result), 50)) },
  error: { load: () => Promise.reject(Object.assign(new Error('refused'), { code: 'failed-precondition' })) },
  loading: { load: () => new Promise(() => {}) },
};

const root = createRoot(document.getElementById('root'));
window.__mmReviewScene = (name) => {
  const scene = SCENES[name] || SCENES.ready;
  root.render(
    <main data-mm-scene={name} style={{ minHeight: '100vh', background: 'var(--mm-page-bg, #f1f3f4)', padding: '16px', boxSizing: 'border-box', fontFamily: '"Segoe UI", sans-serif' }}>
      <section style={{ maxWidth: 860, margin: '0 auto', minWidth: 0 }}>
        <ReviewMyWork key={name + Date.now()} assignment={assignment} load={scene.load} onClose={() => {}} />
      </section>
    </main>,
  );
};
window.__mmReviewScene('ready');
