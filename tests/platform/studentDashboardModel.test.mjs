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

const practice = (id, overrides = {}) => ({
  id,
  title: id,
  assignedClassPeriods: ['Period 1'],
  assignmentType: 'practice',
  dueAt: inHours(4),
  lateDueAt: inHours(24 * 7),
  questions: [{ type: 'algebra', prompt: 'Solve', equationLatex: '2x=8' }],
  ...overrides,
});

const model = (overrides = {}) => buildStudentDashboardModel({
  classPeriod: 'Period 1',
  nowValue: NOW,
  providers: PROVIDERS,
  ...overrides,
});

test('only this student\'s class sees an assignment', () => {
  const result = model({
    assignments: [practice('mine'), practice('theirs', { assignedClassPeriods: ['Period 6'] })],
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
