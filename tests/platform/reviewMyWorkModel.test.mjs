import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  NO_ANSWER_TEXT,
  OUTCOME_LABEL,
  REVIEW_OUTCOME,
  buildReviewMyWorkModel,
  formatSubmittedAnswer,
  looksLikeMath,
  teacherReasonLine,
} from '../../src/platform/student/reviewMyWorkModel.js';

/*
 * REVIEW MY WORK, BROWSER SIDE: the model that turns the server's rows into
 * what the student reads, and the contract that the screen shows solutions
 * only from those rows (src/components/student/ReviewMyWork.jsx).
 */

const assignment = {
  id: 'asg-1',
  schemaVersion: 5,
  title: 'Linear equations',
  sections: [
    { id: 'w', role: 'warmup', title: 'Warm-Up', questions: [
      { questionId: 'q0', type: 'literal', prompt: 'Simplify 2+2', acceptedAnswers: ['4'] },
      { questionId: 'q1', type: 'multiAnswer', prompt: 'Two parts', answerFields: [{ id: 'a', label: 'Slope' }, { id: 'b', label: 'Intercept' }] },
    ] },
    { id: 'c', role: 'classwork', title: '', questions: [
      { questionId: 'q2', type: 'algebra', prompt: 'Solve', answer: 999 },
    ] },
  ],
};

const result = {
  assignmentId: 'asg-1',
  title: 'Linear equations',
  excused: false,
  assignmentChange: null,
  questions: [
    { index: 0, questionId: 'q0', sectionTitle: 'Warm-Up', sectionRole: 'warmup', prompt: 'Simplify 2+2', deliveredQuestion: null,
      solutionSource: 'assignment', submittedResponse: { kind: 'value', type: 'literal', value: '4', fields: [] },
      outcome: 'correct', credit: 100, teacherChanged: false, teacherReason: null },
    { index: 1, questionId: 'q1', sectionTitle: 'Warm-Up', sectionRole: 'warmup', prompt: 'Two parts', deliveredQuestion: null,
      solutionSource: 'assignment', submittedResponse: { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'a', value: '\\frac{1}{2}', isComplete: true }, { id: 'b', value: '', isComplete: false }] },
      outcome: 'partial', credit: 50, teacherChanged: true, teacherReason: 'Partial credit awarded' },
    { index: 2, questionId: 'q2', sectionTitle: null, sectionRole: 'classwork', prompt: 'Solve', deliveredQuestion: null,
      solutionSource: 'unavailable', submittedResponse: null, outcome: 'notAnswered', credit: 0, teacherChanged: false, teacherReason: null },
  ],
};

test('rows come only from the server result — no result, no rows, no solutions', () => {
  assert.deepEqual(buildReviewMyWorkModel({ result: null, assignment }).items, []);
  assert.deepEqual(buildReviewMyWorkModel({ result: undefined, assignment }).items, []);
  assert.deepEqual(buildReviewMyWorkModel({ result: { questions: 'nope' }, assignment }).items, []);
  const model = buildReviewMyWorkModel({ result, assignment });
  assert.equal(model.items.length, 3);
});

test('the solution question: delivered instance first, the stored question only when the server allows it', () => {
  const delivered = { questionId: 'q0', type: 'literal', acceptedAnswers: ['4'], delivered: true };
  const withDelivered = { ...result, questions: [{ ...result.questions[0], deliveredQuestion: delivered, solutionSource: 'delivered' }, ...result.questions.slice(1)] };
  const model = buildReviewMyWorkModel({ result: withDelivered, assignment });
  assert.equal(model.items[0].solutionQuestion.delivered, true);
  // Fallback to the stored question when the server said the stored question IS the delivered one.
  assert.equal(model.items[1].solutionQuestion.questionId, 'q1');
  // A generated question with no kept instance: never the template's answer.
  assert.equal(model.items[2].solutionQuestion, null);
  assert.equal(model.items[2].solutionUnavailable, true);
});

test('numbers, sections, outcome labels and the teacher reason line', () => {
  const model = buildReviewMyWorkModel({ result, assignment });
  assert.deepEqual(model.items.map((item) => item.number), [1, 2, 3]);
  assert.deepEqual(model.items.map((item) => item.section), ['Warm-Up', 'Warm-Up', 'Classwork']);
  assert.deepEqual(model.items.map((item) => item.outcomeLabel), ['Correct', 'Partly correct', 'Not answered']);
  assert.equal(model.items[1].teacherLine, 'Your teacher changed this grade: Partial credit awarded');
  assert.equal(model.items[0].teacherLine, null);
  assert.equal(teacherReasonLine({ teacherChanged: true, teacherReason: null }), 'Your teacher changed this grade.');
  assert.equal(OUTCOME_LABEL[REVIEW_OUTCOME.EXCUSED], 'Excused');
  // An unknown outcome is never shown as a grade.
  const odd = buildReviewMyWorkModel({ result: { questions: [{ ...result.questions[0], outcome: 'bogus' }] }, assignment });
  assert.equal(odd.items[0].outcome, REVIEW_OUTCOME.NOT_ANSWERED);
});

test('assignment-level change and excused state', () => {
  const model = buildReviewMyWorkModel({ result: { ...result, excused: true, assignmentChange: { reason: 'Prohibited cellphone use' } }, assignment });
  assert.equal(model.excused, true);
  assert.equal(model.assignmentLine, 'Your teacher changed this grade: Prohibited cellphone use');
  assert.equal(buildReviewMyWorkModel({ result, assignment }).assignmentLine, null);
});

test('answer formatting: a value, a list of fields, or "No answer recorded"', () => {
  assert.deepEqual(formatSubmittedAnswer(null), { kind: 'none', text: NO_ANSWER_TEXT });
  assert.deepEqual(formatSubmittedAnswer({ kind: 'value', value: '   ' }), { kind: 'none', text: NO_ANSWER_TEXT });
  assert.deepEqual(formatSubmittedAnswer({ kind: 'value', value: 'x = 4' }), { kind: 'value', text: 'x = 4', math: false });
  assert.deepEqual(formatSubmittedAnswer({ kind: 'value', value: 12 }), { kind: 'value', text: '12', math: false });
  const fields = formatSubmittedAnswer(result.questions[1].submittedResponse, assignment.sections[0].questions[1]);
  assert.equal(fields.kind, 'fields');
  assert.deepEqual(fields.items.map((item) => [item.label, item.text, item.math]), [
    ['Slope', '\\frac{1}{2}', true],
    ['Intercept', NO_ANSWER_TEXT, false],
  ]);
  assert.equal(formatSubmittedAnswer({ kind: 'fields', fields: [{ id: 'z', value: '3' }] }).items[0].label, 'Part 1');
  assert.deepEqual(formatSubmittedAnswer({ kind: 'fields', fields: [{ id: 'z', value: '' }] }), { kind: 'none', text: NO_ANSWER_TEXT });
  const structured = formatSubmittedAnswer({ kind: 'value', value: { points: [[1, 2]] } });
  assert.equal(structured.structured, true);
});

test('LaTeX-ish answers are drawn as mathematics; plain words are not', () => {
  assert.equal(looksLikeMath('\\frac{1}{2}'), true);
  assert.equal(looksLikeMath('x^2+1'), true);
  assert.equal(looksLikeMath('3/4'), true);
  assert.equal(looksLikeMath('because it doubles'), false);
  assert.equal(looksLikeMath('12'), false);
  assert.equal(looksLikeMath('$x$ is 3'), false);
});

/* ------------------------------------------------- the component contract */

const component = readFileSync(new URL('../../src/components/student/ReviewMyWork.jsx', import.meta.url), 'utf8');
const code = executableSource(component);

test('component: the model is built only from what load() returned, after it returned', () => {
  // The single place rows are made: from the server state, gated on ready.
  const memo = region(code, 'const model = useMemo(', ');');
  assert.match(memo, /state\.status === 'ready' \? buildReviewMyWorkModel\(\{ result: state\.result, assignment \}\) : null/);
  // Nothing else builds a model or reads the assignment's questions for display.
  assert.equal((code.match(/buildReviewMyWorkModel\(/g) || []).length, 1);
  assert.doesNotMatch(code, /getStoredAssignmentQuestions|assignment\.sections|assignment\?\.sections/);
  // A failed load leaves no result behind.
  assert.match(region(code, '.catch(() => {', '\n      });'), /setState\(\{ status: 'error', result: null \}\)/);
  // Solutions are rendered only from model rows.
  const list = region(code, '{model && (', '\n      )}\n    </section>');
  assert.match(list, /model\.items\.map\(\(item\) => <ReviewQuestion/);
});

test('component: every solution renderer sits inside the supplement boundary', () => {
  const solution = region(code, 'function WorkedSolution', 'function ReviewQuestion');
  const boundary = region(solution, '<QuestionSupplementBoundary', '</QuestionSupplementBoundary>');
  assert.match(boundary, /<ToolSolutionReview question=\{question\} \/>/);
  assert.match(boundary, /<SolutionReview question=\{question\} \/>/);
  assert.equal((code.match(/<SolutionReview\b/g) || []).length, 1);
  assert.equal((code.match(/<ToolSolutionReview\b/g) || []).length, 1);
  // The renderer is imported (the named content check rides the same import, QA round 2).
  assert.match(component, /^import SolutionReview(, \{ legacySolutionReviewContent \})? from '\.\.\/\.\.\/SolutionReview\.jsx';$/m);
  assert.match(component, /^import ToolSolutionReview from '\.\.\/\.\.\/tools\/shared\/ToolSolutionReview\.jsx';$/m);
  assert.match(component, /^import QuestionSupplementBoundary from '\.\.\/\.\.\/QuestionSupplementBoundary\.jsx';$/m);
});

test('component: loading, error with retry, and tap targets', () => {
  assert.match(code, /state\.status === 'error' && \(/);
  assert.match(region(code, "state.status === 'error' && (", '</div>'), /\{LOAD_ERROR_TEXT\}[\s\S]*onClick=\{fetchRows\}/);
  assert.match(region(code, 'const buttonStyle = {', '};'), /minHeight: MIN_TOUCH_TARGET_PX/);
  assert.doesNotMatch(code, /width:\s*['"]?\d{3,}px/);
});

test('the prompt shown comes from the delivered question, never the stored template', () => {
  const template = { questionId: 'q2', type: 'algebra', prompt: 'Solve {{a}}x + {{b}} = {{c}}', answer: 999 };
  const generated = { ...assignment, sections: [assignment.sections[0], { ...assignment.sections[1], questions: [template] }] };
  const delivered = { ...template, prompt: 'Solve 2x + 1 = 7', answer: 3 };
  const row = { ...result.questions[2], solutionSource: 'delivered', deliveredQuestion: delivered };
  // Even when the server's own prompt is the template (an older server) or empty.
  for (const prompt of ['Solve {{a}}x + {{b}} = {{c}}', '', null]) {
    const model = buildReviewMyWorkModel({ result: { ...result, questions: [{ ...row, prompt }] }, assignment: generated });
    assert.equal(model.items[0].prompt, 'Solve 2x + 1 = 7');
  }
  // With no delivered instance: the server's prompt, then the stored question's.
  assert.equal(buildReviewMyWorkModel({ result, assignment }).items[0].prompt, 'Simplify 2+2');
  const noServerPrompt = { ...result, questions: [{ ...result.questions[0], prompt: '' }] };
  assert.equal(buildReviewMyWorkModel({ result: noServerPrompt, assignment }).items[0].prompt, 'Simplify 2+2');
});

test('numbers do not shift when Warm-Up rows are withheld: the server number, else the included position', () => {
  const classworkOnly = { ...result, warmupWithheld: true, questions: [result.questions[2]] };
  // No server number (older server): the position among the stored, non-excluded questions.
  assert.equal(buildReviewMyWorkModel({ result: classworkOnly, assignment }).items[0].number, 3);
  // The server's number wins.
  const numbered = { ...classworkOnly, questions: [{ ...result.questions[2], number: 3 }] };
  assert.equal(buildReviewMyWorkModel({ result: numbered, assignment: null }).items[0].number, 3);
  // A teacher-excluded question earlier in the list is not counted.
  const excluded = structuredClone(assignment);
  excluded.sections[0].questions[1].teacherExcluded = true;
  assert.equal(buildReviewMyWorkModel({ result: classworkOnly, assignment: excluded }).items[0].number, 2);
});

test('a withheld Warm-Up is explained, never silently missing', async () => {
  const { readFileSync } = await import('node:fs');
  const { buildReviewMyWorkModel } = await import('../../src/platform/student/reviewMyWorkModel.js');
  assert.equal(buildReviewMyWorkModel({ result: { questions: [], warmupWithheld: true } }).warmupWithheld, true);
  assert.equal(buildReviewMyWorkModel({ result: { questions: [] } }).warmupWithheld, false);
  const component = readFileSync(new URL('../../src/components/student/ReviewMyWork.jsx', import.meta.url), 'utf8');
  assert.match(component, /\{model\.warmupWithheld && <p[^>]*>Your Warm-Up review will appear here after your teacher closes the Warm-Up again\.<\/p>\}/);
});
