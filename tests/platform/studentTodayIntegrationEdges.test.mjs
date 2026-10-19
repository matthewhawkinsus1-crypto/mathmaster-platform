import test from 'node:test';
import assert from 'node:assert/strict';
import { BUCKET, buildStudentDashboardModel, resolveNextAction } from '../../src/studentDashboardModel.js';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getWarmupState, getIncludedQuestionIndices,
  getSectionAccessState, prerequisiteAccess, questionIsIncluded,
} from '../../src/assignmentLifecycle.js';
import { normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';

/*
 * Edges of the one "Today" rule found by booting the real App as a student
 * against the Firestore emulator (job C integration verification):
 *
 *   - an excused Test Cycle was filed under "Past due — late work still
 *     counts" with a Start Review button (its stage description knows nothing
 *     of the excusal);
 *   - a lesson with no question to land on (notes-only, or every question
 *     removed) was the Home card's "Start it", and pressing it did nothing —
 *     startAssignment returns on an assignment with no questions.
 */

const NOW = Date.parse('2026-10-26T15:00:00Z');
const at = (hours) => new Date(NOW + hours * 3600e3).toISOString();
const STUDENT = 's1';
const PROVIDERS = {
  assignmentIsForStudent,
  getAssignmentLifecycle: (assignment, nowValue) => getAssignmentLifecycle(assignment, nowValue, { studentId: STUDENT }),
  prerequisiteAccess,
  calculateGrade: () => 0,
  getDOLState,
  getWarmupState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView,
  getSectionAccessState,
};
const model = (overrides = {}) => buildStudentDashboardModel({
  classId: 'class-1', classPeriod: 'Period 1', nowValue: NOW, providers: PROVIDERS, studentId: STUDENT, tracker: {}, ...overrides,
});
const entryOf = (dashboard, id) => dashboard.allEntries.find((entry) => entry.assignment.id === id);
const nextOf = (dashboard) => resolveNextAction({ dashboard, weeklyProgress: { completed: 1, required: 1, remaining: 0 } });
const q = (prompt, role) => ({ type: 'algebra', prompt, equationLatex: 'x=1', activityRole: role });

const testCycle = (overrides = {}) => ({
  schemaVersion: 5,
  id: 'cycle',
  title: 'Unit test',
  assignedClassIds: ['class-1'],
  dueAt: at(-24),
  lateDueAt: at(24 * 5),
  assessmentPolicy: { mode: 'testCycle', review: { required: true } },
  sections: [{ id: 'review', role: 'review', questions: [q('R1', 'review')] }],
  ...overrides,
});

test('an excused Test Cycle is finished, never past due, never a Start', () => {
  const dashboard = model({ assignments: [testCycle({ studentOverrides: { [STUDENT]: { excused: true } } })] });
  const entry = entryOf(dashboard, 'cycle');
  assert.ok(entry.testCycle, 'the fixture is a real Test Cycle (mode: testCycle)');
  assert.equal(entry.excused, true);
  assert.equal(entry.finished, true);
  assert.equal(entry.actionable, false);
  assert.equal(entry.bucket, BUCKET.COMPLETED);
  assert.notEqual(nextOf(dashboard).assignment?.id, 'cycle');
  // The same cycle for a student who is not excused is ordinary past-due Review.
  const ordinary = entryOf(model({ assignments: [testCycle()] }), 'cycle');
  assert.equal(ordinary.bucket, BUCKET.PAST_DUE);
  assert.equal(ordinary.actionable, true);
});

test('a lesson with no question to land on is never the Start button', () => {
  const notesOnly = {
    schemaVersion: 5,
    id: 'notes',
    title: 'Notes only',
    assignedClassIds: ['class-1'],
    dueAt: at(3),
    lateDueAt: at(24 * 5),
    sections: [{ id: 'classwork', role: 'classwork', questions: [] }],
  };
  const allRemoved = {
    ...notesOnly,
    id: 'removed',
    sections: [{ id: 'classwork', role: 'classwork', questions: [{ ...q('CW1', 'classwork'), teacherExcluded: true }] }],
  };
  const dashboard = model({ assignments: [notesOnly, allRemoved] });
  for (const id of ['notes', 'removed']) {
    const entry = entryOf(dashboard, id);
    assert.equal(entry.actionable, false, id);
    assert.equal(entry.disabled, true, id);
  }
  const next = nextOf(dashboard);
  assert.ok(!['dueToday', 'pastDue', 'assignedLater', 'inProgress'].includes(next.kind), `recommended ${next.kind}`);
  assert.equal(next.assignment, undefined);
});
