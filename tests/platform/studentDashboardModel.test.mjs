import test from 'node:test';
import assert from 'node:assert/strict';
import { BUCKET, buildStudentDashboardModel } from '../../src/studentDashboardModel.js';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getIncludedQuestionIndices,
  prerequisiteAccess, questionIsIncluded,
} from '../../src/assignmentLifecycle.js';
import { normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';

const NOW = Date.parse('2026-10-26T15:00:00Z');
const inHours = (hours) => new Date(NOW + hours * 3600e3).toISOString();

const PROVIDERS = {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  prerequisiteAccess,
  calculateGrade: () => 0,
  getDOLState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView,
};

const practice = (id, overrides = {}) => {
  const authoredQuestions = Array.isArray(overrides.questions)
    ? overrides.questions
    : [{ type: 'algebra', prompt: 'Solve', equationLatex: '2x=8' }];
  const { questions: _retiredQuestions, ...rest } = overrides;
  return {
    id,
    title: id,
    assignedClassIds: ['class-1'],
    dueAt: inHours(4),
    lateDueAt: inHours(24 * 7),
    sections: [{
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: authoredQuestions.map((question) => ({ ...question, activityRole: question.activityRole || 'practice' })),
    }],
    ...rest,
  };
};

const model = (overrides = {}) => buildStudentDashboardModel({
  classId: 'class-1',
  classPeriod: 'Period 1',
  nowValue: NOW,
  providers: PROVIDERS,
  ...overrides,
});

test('only this student\'s class sees an assignment', () => {
  const result = model({
    assignments: [practice('mine'), practice('theirs', { assignedClassIds: ['class-6'] })],
  });
  assert.deepEqual(result.visibleAssignments.map((assignment) => assignment.id), ['mine']);
});

test('work due today is Do Now; work due later is Coming Up', () => {
  const result = model({
    assignments: [practice('today'), practice('later', { dueAt: inHours(24 * 5), lateDueAt: inHours(24 * 12) })],
  });
  assert.deepEqual(result.doNowEntries.map((entry) => entry.assignment.id), ['today']);
  assert.deepEqual(result.comingUpEntries.map((entry) => entry.assignment.id), ['later']);
  assert.equal(result.completedEntries.length, 0);
});

test('a finished assignment moves to Completed', () => {
  const result = model({
    assignments: [practice('done')],
    tracker: { done: { 0: { status: 'correct', attemptCount: 1 } } },
  });
  assert.equal(result.completedEntries.length, 1);
  assert.equal(result.doNowEntries.length, 0);
});

test('progress is counted before the student opens anything', () => {
  const two = practice('two', {
    questions: [
      { type: 'algebra', prompt: 'a', equationLatex: 'x=1' },
      { type: 'algebra', prompt: 'b', equationLatex: 'x=2' },
    ],
  });
  const result = model({
    assignments: [practice('resumeMe'), two],
    tracker: {
      resumeMe: {},
      two: { 0: { status: 'correct', attemptCount: 1 } },
    },
    // Something else is the resume card, so `two` stays in the lists where its
    // progress is visible.
    resumeAction: { assignmentId: 'resumeMe', questionIndex: 0 },
  });
  const entry = result.entries.find((row) => row.assignment.id === 'two');
  assert.equal(entry.questionsTotal, 2);
  assert.equal(entry.questionsDone, 1);
});

// --- The distinction that must survive the extraction ------------------------

test('an assignment prerequisite still locks the card', () => {
  // Practice gated behind notes the student has not finished. This is an
  // ASSIGNMENT gate, and it is not the same thing as a mathematical skill
  // prerequisite — the path engine is not consulted here at all.
  const notes = practice('notes', { assignmentType: 'notesClasswork', questions: [] });
  const gated = practice('gated', { prerequisiteAssignmentId: 'notes', releaseAt: inHours(48) });
  const locked = model({ assignments: [notes, gated], classworkGradesByAssignment: {} });
  const lockedEntry = locked.entries.find((entry) => entry.assignment.id === 'gated');
  assert.ok(lockedEntry, 'the gated assignment must still be listed');
  assert.equal(lockedEntry.disabled, true, 'and it must be locked');

  const opened = model({
    assignments: [notes, gated],
    classworkGradesByAssignment: { notes: { score: 100 } },
  });
  const openedEntry = opened.entries.find((entry) => entry.assignment.id === 'gated');
  assert.equal(openedEntry.disabled, false, 'finishing the notes opens it');
});

// --- Resume ------------------------------------------------------------------

test('the saved resume point wins over the first unfinished question', () => {
  const three = practice('three', {
    questions: [
      { type: 'algebra', prompt: 'a', equationLatex: 'x=1' },
      { type: 'algebra', prompt: 'b', equationLatex: 'x=2' },
      { type: 'algebra', prompt: 'c', equationLatex: 'x=3' },
    ],
  });
  const result = model({
    assignments: [three],
    tracker: { three: { 0: { status: 'correct', attemptCount: 1 } } },
    resumeAction: { assignmentId: 'three', questionIndex: 2 },
  });
  assert.equal(result.resumeAssignment.id, 'three');
  assert.equal(result.resumeQuestionIndex, 2);
});

test('with no saved point, resume lands on the first unfinished question', () => {
  const two = practice('two', {
    questions: [
      { type: 'algebra', prompt: 'a', equationLatex: 'x=1' },
      { type: 'algebra', prompt: 'b', equationLatex: 'x=2' },
    ],
  });
  const result = model({
    assignments: [two],
    tracker: { two: { 0: { status: 'correct', attemptCount: 1 } } },
  });
  assert.equal(result.resumeAssignment.id, 'two');
  assert.equal(result.resumeQuestionIndex, 1);
});

test('the resumed assignment is not listed twice', () => {
  const result = model({
    assignments: [practice('one')],
    tracker: { one: {} },
    resumeAction: { assignmentId: 'one', questionIndex: 0 },
  });
  assert.equal(result.resumeAssignment?.id, 'one');
  assert.equal(result.entries.some((entry) => entry.assignment.id === 'one'), false);
});

test('nothing assigned is an empty dashboard, not a crash', () => {
  const result = model({ assignments: [] });
  assert.deepEqual(result.entries, []);
  assert.equal(result.resumeAssignment, null);
  assert.deepEqual(result.activeDols, []);
});

test('a bucket is assigned exactly once', () => {
  const result = model({
    assignments: [practice('a'), practice('b', { dueAt: inHours(24 * 4), lateDueAt: inHours(24 * 9) })],
  });
  const counted = result.doNowEntries.length + result.comingUpEntries.length + result.completedEntries.length;
  assert.equal(counted, result.entries.length);
  assert.ok(result.entries.every((entry) => Object.values(BUCKET).includes(entry.bucket)));
});

// --- Phase 9: finer groupings ------------------------------------------------------
//
// Three buckets works for a student with four assignments and stops working at
// twenty. Each new group exists because burying it inside "do now" changed what
// the student would do.

test('late work is its own group, not mixed in with today\'s', () => {
  // Burying an overdue assignment among today's is how it stays overdue.
  const result = model({
    assignments: [
      practice('today'),
      practice('overdue', { dueAt: inHours(-48), lateDueAt: inHours(24 * 3) }),
    ],
  });
  assert.deepEqual(result.pastDueEntries.map((entry) => entry.assignment.id), ['overdue']);
  assert.deepEqual(result.doNowEntries.map((entry) => entry.assignment.id), ['today']);
});

test('a half-finished assignment is Keep Going, not a fresh task', () => {
  // Cheaper to finish than a new thing is to start, and a student who cannot
  // see which ones are already open re-starts things instead.
  const started = practice('started', {
    questions: [
      { type: 'algebra', prompt: 'a', equationLatex: '2x=8' },
      { type: 'algebra', prompt: 'b', equationLatex: '3x=9' },
    ],
  });
  const result = model({
    assignments: [started],
    tracker: { started: { 0: { status: 'correct', totalAttempts: 1 } } },
    // Resume would otherwise claim it; this test is about the bucket.
    resumeAction: { assignmentId: 'nothing' },
  });
  const entry = result.entries.find((item) => item.assignment.id === 'started')
    || { bucket: result.resumeAssignment?.id === 'started' ? 'resumed' : null };
  assert.ok(
    entry.bucket === BUCKET.IN_PROGRESS || result.resumeAssignment?.id === 'started',
    'a started assignment must surface as continuable, not as a new task',
  );
});

test('practice-only work is not filed as past due', () => {
  // It is past its deadline but no longer graded. Sitting it in "past due"
  // makes a student anxious about a grade they cannot change.
  const result = model({
    assignments: [practice('closed', { dueAt: inHours(-24 * 20), lateDueAt: inHours(-24 * 10) })],
  });
  assert.equal(result.pastDueEntries.length, 0);
  assert.ok(
    result.practiceEntries.length === 1 || result.completedEntries.length === 1,
    'closed work belongs in practice or completed, never in past due',
  );
});

test('every entry lands in exactly one group', () => {
  const result = model({
    assignments: [
      practice('today'),
      practice('later', { dueAt: inHours(24 * 5), lateDueAt: inHours(24 * 12) }),
      practice('overdue', { dueAt: inHours(-48), lateDueAt: inHours(24 * 3) }),
    ],
  });
  const grouped = Object.values(result.groups).flat().length;
  assert.equal(grouped, result.entries.length, 'an entry was double-counted or lost');
});

test('the groups a student must act on open by default; the rest are collapsed', async () => {
  const { BUCKET_OPEN_BY_DEFAULT } = await import('../../src/studentDashboardModel.js');
  assert.equal(BUCKET_OPEN_BY_DEFAULT[BUCKET.PAST_DUE], true);
  assert.equal(BUCKET_OPEN_BY_DEFAULT[BUCKET.DO_NOW], true);
  assert.equal(BUCKET_OPEN_BY_DEFAULT[BUCKET.COMPLETED], false,
    'finished work is reassurance, not today\'s job');
  assert.equal(BUCKET_OPEN_BY_DEFAULT[BUCKET.COMING_UP], false);
});

// --- Phase 9: one answer to "what should I do now?" ----------------------------------

test('a live exit ticket outranks everything else', async () => {
  const { resolveNextAction } = await import('../../src/studentDashboardModel.js');
  const next = resolveNextAction({
    dashboard: {
      activeDols: [{ assignment: { id: 'dol', title: 'Exit ticket' } }],
      resumeAssignment: { id: 'other', title: 'Other' },
      groups: {},
    },
  });
  assert.equal(next.kind, 'dol', 'a timed thing that closes cannot wait behind anything');
});

test('unfinished work outranks something new', async () => {
  const { resolveNextAction } = await import('../../src/studentDashboardModel.js');
  const next = resolveNextAction({
    dashboard: {
      activeDols: [],
      resumeAssignment: { id: 'half', title: 'Half done' },
      resumeQuestionIndex: 3,
      groups: { [BUCKET.DO_NOW]: [{ assignment: { id: 'new', title: 'New' } }] },
    },
  });
  assert.equal(next.kind, 'resume');
  assert.equal(next.questionIndex, 3);
});

test('past due is named as late but never as lost', async () => {
  const { resolveNextAction } = await import('../../src/studentDashboardModel.js');
  const next = resolveNextAction({
    dashboard: {
      activeDols: [], resumeAssignment: null,
      groups: { [BUCKET.PAST_DUE]: [{ assignment: { id: 'late', title: 'Late one' }, questionsDone: 0, questionsTotal: 5 }] },
    },
  });
  assert.equal(next.kind, 'pastDue');
  assert.match(next.detail, /still counts/i,
    'a student who believes late work no longer counts stops doing it');
});

test('with no assignments pressing, the weekly Path goal is the answer', async () => {
  const { resolveNextAction } = await import('../../src/studentDashboardModel.js');
  const next = resolveNextAction({
    dashboard: { activeDols: [], resumeAssignment: null, groups: {} },
    weeklyProgress: { required: 4, completed: 1, remaining: 3, overdue: false },
  });
  assert.equal(next.kind, 'weeklyPath');
  assert.match(next.detail, /1 of 4/);
});

test('caught up is a real answer, said out loud', async () => {
  // An empty screen reads as a broken screen.
  const { resolveNextAction } = await import('../../src/studentDashboardModel.js');
  const next = resolveNextAction({
    dashboard: { activeDols: [], resumeAssignment: null, groups: {} },
    weeklyProgress: { required: 4, completed: 4, remaining: 0, overdue: false },
  });
  assert.equal(next.kind, 'clear');
  assert.ok(next.headline.length > 0);
  assert.ok(next.actionLabel.length > 0, 'even "caught up" offers somewhere to go');
});

test('there is always exactly one next action, whatever the state', async () => {
  const { resolveNextAction } = await import('../../src/studentDashboardModel.js');
  [
    {},
    { dashboard: null },
    { dashboard: { activeDols: [], resumeAssignment: null, groups: {} } },
    { dashboard: {}, weeklyProgress: null },
  ].forEach((input) => {
    const next = resolveNextAction(input);
    assert.ok(next && next.kind && next.headline && next.actionLabel,
      `no usable next action for ${JSON.stringify(input)}`);
  });
});

test('Home does not claim the weekly Path is done when it never checked', async () => {
  // Home does not fetch Path evidence. A confident "this week's Path is done"
  // that nobody verified is a lie a student would act on.
  const { resolveNextAction } = await import('../../src/studentDashboardModel.js');
  const uninformed = resolveNextAction({ dashboard: { activeDols: [], resumeAssignment: null, groups: {} } });
  const informed = resolveNextAction({
    dashboard: { activeDols: [], resumeAssignment: null, groups: {} },
    weeklyProgress: { required: 4, completed: 4, remaining: 0, overdue: false },
  });
  assert.equal(uninformed.kind, 'clear');
  assert.ok(!/Path is done/i.test(uninformed.detail),
    'a screen without the data must not assert the result');
  assert.match(informed.detail, /Path is done/i, 'a screen with the data may say so');
});
