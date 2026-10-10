/*
 * RELEASE-CANDIDATE QA COPY FINDINGS FOR JOB J (m9, m13).
 *
 *   m9  the worked-solution panel promises steps only when it shows steps;
 *       the legacy review of "Solve 2x + 1 = 7" no longer offers a point on
 *       y = x; Review My Work says "Not correct" (the work is closed) and
 *       writes a sequence answer as a list.
 *   m13 "New:" only for work not started and still open; "1 question",
 *       never "1 questions"; no "DOL is open — start now" while the student
 *       is on that DOL (rule in src/platform/student/dolReminder.js; the
 *       App.jsx call is job G's to wire).
 *
 * Mutation-checked: each assertion below went red with its fix reverted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { OUTCOME_LABEL, REVIEW_OUTCOME, formatSubmittedAnswer } from '../../src/platform/student/reviewMyWorkModel.js';
import { buildWhatChanged } from '../../src/platform/student/whatChangedModel.js';
import { shouldShowDolOpenReminder } from '../../src/platform/student/dolReminder.js';
import { questionCountText } from '../../src/platform/student/countText.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('m9: the panel says "each step" only over steps; over a bare answer it says so', () => {
  const answerOnly = buildClosedQuestionReview({ question: { solutionReview: { answerSummary: 'Slope: -2/3; y-intercept: 4' } } });
  assert.equal(answerOnly.hasSteps, false);
  assert.doesNotMatch(answerOnly.intro, /step/i);
  assert.match(answerOnly.intro, /correct one/);
  const stepped = buildClosedQuestionReview({ question: { solutionReview: { headline: 'h', reasoning: ['Subtract 1.', 'Divide by 2.'], answerSummary: 'x = 3' } } });
  assert.equal(stepped.hasSteps, true);
  assert.match(stepped.intro, /each step/);
  const correctBare = buildClosedQuestionReview({ question: { solutionReview: { answerSummary: 'x = 3' } }, wasCorrect: true });
  assert.doesNotMatch(correctBare.intro, /reasoning/);
});

test('m9: the legacy review of an equation in x never offers a point on y = x', () => {
  const legacy = executableSource(read('src/SolutionReview.jsx'));
  const algebra = region(legacy, "case 'algebra': {", "case 'numberLine':");
  assert.doesNotMatch(algebra, /y = x/);
  assert.match(algebra, /`x = \$\{answer\}`/);
  // One form is labelled "Answer", several are numbered forms — never "Representation".
  assert.doesNotMatch(legacy, /Representation \$\{/);
});

test('m9: Review My Work on closed work: "Not correct"; a sequence answer is written as a list', () => {
  assert.equal(OUTCOME_LABEL[REVIEW_OUTCOME.INCORRECT], 'Not correct');
  assert.deepEqual(formatSubmittedAnswer({ kind: 'value', value: [2, 4, 8, 16] }), { kind: 'value', text: '2, 4, 8, 16', math: false });
  assert.equal(formatSubmittedAnswer({ kind: 'value', value: { text: 'x = 3' } }).text, 'x = 3');
  assert.equal(formatSubmittedAnswer({ kind: 'value', value: { points: [[1, 2]] } }).structured, true, 'a graph is still not text');
});

const NOW = Date.parse('2026-10-10T15:00:00Z');
const lesson = (overrides = {}) => ({
  id: 'a-1',
  title: 'Linear Functions — Review',
  assignedClassIds: ['class-a'],
  releaseAt: '2026-10-01T08:00:00',
  dueAt: '2026-10-20T23:59:00',
  ...overrides,
});
const whatChanged = (assignment, tracker = {}) => buildWhatChanged({
  studentId: 'stu-1',
  classId: 'class-a',
  classPeriod: '3',
  assignments: [assignment],
  trackerByAssignment: { [assignment.id]: tracker },
  nowValue: NOW,
});

test('m13: "New:" only for work the student has not started and can still do', () => {
  assert.deepEqual(whatChanged(lesson()).map((item) => item.text), ['New: Linear Functions — Review']);
  assert.deepEqual(whatChanged(lesson(), { 0: { status: 'correct', attemptCount: 1 } }), [], 'started work is not new');
  assert.deepEqual(whatChanged(lesson({ dueAt: '2026-10-05T23:59:00' })), [], 'closed work is not new');
});

test('m13: a count of one question is singular', () => {
  assert.equal(questionCountText(1), '1 question');
  assert.equal(questionCountText(0), '0 questions');
  assert.equal(questionCountText(7), '7 questions');
  const path = executableSource(read('src/components/student/MyMathPathProductionContainer.jsx'));
  assert.doesNotMatch(path, /\} questions in this practice round|\} questions\.`/);
  assert.match(path, /questionCountText\(/);
  assert.match(path, /import \{ questionCountText \} from '\.\.\/\.\.\/platform\/student\/countText\.js';/);
});

test('m13: no "DOL is open" reminder while the student is on that DOL', () => {
  const dol = { assignmentId: 'a-1', dolQuestionIndices: [5, 6] };
  assert.equal(shouldShowDolOpenReminder({ ...dol, activeView: 'assignment', activeAssignmentId: 'a-1', currentQuestionIndex: 5 }), false);
  assert.equal(shouldShowDolOpenReminder({ ...dol, activeView: 'assignment', activeAssignmentId: 'a-1', currentQuestionIndex: 2 }), true, 'on Classwork of the same lesson');
  assert.equal(shouldShowDolOpenReminder({ ...dol, activeView: 'dashboard', activeAssignmentId: 'a-1', currentQuestionIndex: 5 }), true);
  assert.equal(shouldShowDolOpenReminder({ ...dol, activeView: 'assignment', activeAssignmentId: 'a-2', currentQuestionIndex: 5 }), true);
});
