import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BUCKET, buildStudentDashboardModel } from '../../src/studentDashboardModel.js';
import { buildStudentGradeCenter, findGradeCenterEntry } from '../../src/platform/student/studentGradeCenterModel.js';
import {
  ALL_PERIODS_ID,
  ASSIGNMENT_CATEGORY,
  buildStudentAssignmentsCenter,
  categoriesForRow,
  matchesAssignmentSearch,
} from '../../src/platform/student/studentAssignmentsCenterModel.js';
import { splitGrade } from '../../src/platform/teacher/gradeEvidence.js';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getWarmupState,
  getIncludedQuestionIndices, prerequisiteAccess, questionIsIncluded,
} from '../../src/assignmentLifecycle.js';
import { normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';
import { executableSource } from './helpers/sourceContract.mjs';

const CLASS_ID = 'class-1';
const NOW = Date.parse('2026-10-26T15:00:00Z');
const at = (hours) => new Date(NOW + hours * 3600e3).toISOString();

const PROVIDERS = {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  prerequisiteAccess,
  calculateGrade: () => 0,
  getDOLState,
  getWarmupState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView,
};

const lesson = (id, title, overrides = {}) => ({
  schemaVersion: 5,
  id,
  title,
  assignedClassIds: [CLASS_ID],
  dueAt: at(4),
  lateDueAt: at(24 * 7),
  // Practice-role sections: a classwork-role section projects to the
  // notesClasswork assignment type, whose completion is decided by a separate
  // daily classwork grade rather than by the tracker. That is a different
  // fixture question from the one these tests are asking.
  sections: [{
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: [{ id: `${id}-q1`, activityRole: 'practice' }, { id: `${id}-q2`, activityRole: 'practice' }],
  }],
  ...overrides,
});

const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1 };
const partial = { status: 'expired', attemptCount: 3, totalAttempts: 3, bestPartialCredit: 50 };

const PERIOD_SETTINGS = {
  periods: [
    { id: 'mp0', label: 'Marking Period 0', order: 1, archived: true },
    { id: 'mp1', label: 'Marking Period 1', order: 2 },
  ],
  currentPeriodId: 'mp1',
};

const inPeriod = (id) => ({ gradingPeriod: { id, label: id === 'mp0' ? 'Marking Period 0' : 'Marking Period 1', order: id === 'mp0' ? 1 : 2 } });

// A realistic term: work in progress, work due later, finished work, and an
// assignment that closed a fortnight ago in a marking period that is now shut.
const ASSIGNMENTS = [
  lesson('in-progress', 'Systems of Equations', { ...inPeriod('mp1') }),
  lesson('due-later', 'Quadratics Investigation', { dueAt: at(24 * 5), lateDueAt: at(24 * 9), ...inPeriod('mp1') }),
  lesson('finished', 'Exponent Rules', { ...inPeriod('mp1') }),
  lesson('closed', 'Functions & Domain/Range', {
    dueAt: at(-24 * 20), lateDueAt: at(-24 * 14), ...inPeriod('mp0'),
  }),
  lesson('locked', 'Unit 4 Opener', { releaseAt: at(24 * 3), dueAt: at(24 * 6), lateDueAt: at(24 * 10), ...inPeriod('mp1') }),
];

const TRACKER = {
  'in-progress': { 0: correct },
  finished: { 0: correct, 1: partial },
  closed: { 0: correct, 1: correct },
};

const buildContext = ({ assignments = ASSIGNMENTS, tracker = TRACKER, resumeAction = null } = {}) => {
  const dashboard = buildStudentDashboardModel({
    assignments, classId: CLASS_ID, classPeriod: 'Period 1', nowValue: NOW,
    tracker, resumeAction, providers: PROVIDERS,
  });
  const gradeCenter = buildStudentGradeCenter({
    assignments, classId: CLASS_ID, classPeriod: 'Period 1', studentId: 'student-1',
    nowValue: NOW, tracker, gradingPeriodSettings: PERIOD_SETTINGS,
  });
  return { dashboard, gradeCenter };
};

const center = (options = {}) => {
  const { dashboard, gradeCenter } = buildContext(options);
  return buildStudentAssignmentsCenter({
    dashboard, gradeCenter, gradingPeriodSettings: PERIOD_SETTINGS, ...options,
  });
};

const idsIn = (result, categoryId) => (
  result.categories.find((group) => group.id === categoryId)?.entries.map((row) => row.assignmentId) || []
);

/* 3. THE FOUR CATEGORIES. */

test('the Assignments Center offers active, upcoming, completed and practice categories', () => {
  const result = center({ periodId: ALL_PERIODS_ID });
  assert.deepEqual(
    result.categories.map((group) => group.id),
    [ASSIGNMENT_CATEGORY.ACTIVE, ASSIGNMENT_CATEGORY.UPCOMING, ASSIGNMENT_CATEGORY.COMPLETED, ASSIGNMENT_CATEGORY.PRACTICE],
  );

  assert.ok(idsIn(result, ASSIGNMENT_CATEGORY.ACTIVE).includes('in-progress'), 'started work is Active');
  assert.ok(idsIn(result, ASSIGNMENT_CATEGORY.UPCOMING).includes('due-later'), 'work due later is Upcoming');
  assert.ok(idsIn(result, ASSIGNMENT_CATEGORY.UPCOMING).includes('locked'), 'work not open yet is Upcoming');
  assert.ok(idsIn(result, ASSIGNMENT_CATEGORY.COMPLETED).includes('finished'), 'finished work is Completed');
  assert.ok(idsIn(result, ASSIGNMENT_CATEGORY.PRACTICE).includes('closed'), 'closed work is offered for practice');

  // Every category carries its own count, and every assignment lands somewhere.
  result.categories.forEach((group) => assert.equal(group.count, group.entries.length));
  const placed = new Set(result.categories.flatMap((group) => group.entries.map((row) => row.assignmentId)));
  assert.equal(placed.size, result.totalCount);
});

test('a closed assignment is reachable from Practice AND kept in its finished group', () => {
  // The one deliberate overlap. "Completed" is the record of what a student
  // did; "Practice" is what they can still work on. A closed assignment is
  // honestly both, and making it pick one hides it from somebody.
  const result = center({ periodId: ALL_PERIODS_ID });
  const closed = result.rows.find((row) => row.assignmentId === 'closed');
  assert.ok(closed.categories.includes(ASSIGNMENT_CATEGORY.PRACTICE));
  assert.ok(closed.categories.length > 1, 'a closed assignment does not vanish from its finished group');

  // Open work is never offered as no-credit practice.
  assert.deepEqual(
    categoriesForRow({ bucket: BUCKET.IN_PROGRESS, practiceAvailable: false }),
    [ASSIGNMENT_CATEGORY.ACTIVE],
  );
});

test('Home hides three assignments that the Assignments Center must still show', () => {
  // Home removes the Resume assignment so it is not offered twice. That is
  // right for Home and is exactly the omission that made older work hard to
  // find, so the Center reads allEntries instead.
  const { dashboard } = buildContext({ resumeAction: { assignmentId: 'in-progress', questionIndex: 0 } });
  assert.equal(dashboard.resumeAssignment?.id, 'in-progress');
  assert.ok(
    !dashboard.entries.some((entry) => entry.assignment.id === 'in-progress'),
    'Home deliberately leaves the resume assignment out of its list',
  );

  const result = center({ resumeAction: { assignmentId: 'in-progress', questionIndex: 0 }, periodId: ALL_PERIODS_ID });
  assert.ok(
    result.rows.some((row) => row.assignmentId === 'in-progress'),
    'the Assignments Center shows every assignment, including the one Home is resuming',
  );
  assert.equal(result.totalCount, ASSIGNMENTS.length);
});

/* 4. SEARCH REACHES OLDER AND COMPLETED WORK. */

test('search finds a closed assignment from a different tab and a closed marking period', () => {
  // The reported problem: a student standing in Active cannot find the
  // investigation they finished last term. Search must ignore both filters.
  const result = center({ search: 'domain range', periodId: 'mp1', category: ASSIGNMENT_CATEGORY.ACTIVE });

  assert.equal(result.isSearching, true);
  assert.deepEqual(result.visibleEntries.map((row) => row.assignmentId), ['closed']);
  assert.equal(result.activePeriodId, 'mp1', 'the filter is untouched — search simply reaches past it');
});

test('search is forgiving about case, order and partial titles', () => {
  const row = { title: 'Functions & Domain/Range', gradingPeriod: { label: 'Marking Period 0' }, statusLabel: 'Graded' };
  assert.equal(matchesAssignmentSearch(row, 'FUNCTIONS'), true);
  assert.equal(matchesAssignmentSearch(row, 'range functions'), true);
  assert.equal(matchesAssignmentSearch(row, 'domain'), true);
  assert.equal(matchesAssignmentSearch(row, 'marking period 0'), true, 'a student may remember the term, not the title');
  assert.equal(matchesAssignmentSearch(row, 'trigonometry'), false);
  assert.equal(matchesAssignmentSearch(row, '   '), true, 'an empty search hides nothing');
});

/* 5. THE MARKING-PERIOD FILTER REACHES PAST PERIODS. */

test('the marking-period filter defaults to the current period and can expose closed ones', () => {
  const current = center();
  assert.equal(current.activePeriodId, 'mp1', 'current marking period by default');
  assert.ok(
    !current.rows.filter((row) => row.gradingPeriod?.id === 'mp1').some((row) => row.assignmentId === 'closed'),
    'last term\'s work is not in this term\'s list',
  );
  assert.ok(
    !current.categories.some((group) => group.entries.some((row) => row.assignmentId === 'closed')),
  );

  // An archived period stays selectable — a closed term is where old work is.
  const past = center({ periodId: 'mp0' });
  assert.equal(past.activePeriodId, 'mp0');
  assert.deepEqual(
    past.categories.flatMap((group) => group.entries.map((row) => row.assignmentId)).filter((id, index, all) => all.indexOf(id) === index),
    ['closed'],
  );
  const archivedOption = past.periodOptions.find((option) => option.id === 'mp0');
  assert.equal(archivedOption.archived, true, 'and it is labelled as closed rather than hidden');
  assert.equal(archivedOption.count, 1);

  // And "everything" is one choice away.
  const all = center({ periodId: ALL_PERIODS_ID });
  assert.equal(all.rows.length, ASSIGNMENTS.length);
  assert.ok(all.categories.some((group) => group.entries.some((row) => row.assignmentId === 'closed')));
});

test('a marking period that no longer exists falls back instead of emptying the screen', () => {
  const result = center({ periodId: 'deleted-period' });
  assert.equal(result.activePeriodId, 'mp1');
  assert.ok(result.categories.some((group) => group.count > 0));
});

/* 6-7. RESULTS AND PRACTICE, READ FROM THE GRADE CENTER. */

test('every grade on an assignment row is the Grade Center entry, not a new calculation', () => {
  const { gradeCenter } = buildContext();
  const result = center({ periodId: ALL_PERIODS_ID });
  const closed = result.rows.find((row) => row.assignmentId === 'closed');
  const gradeEntry = findGradeCenterEntry(gradeCenter, 'closed');

  assert.equal(closed.displayGrade, gradeEntry.displayGrade);
  assert.equal(closed.status, gradeEntry.status);
  assert.deepEqual(closed.sections, gradeEntry.sections);
  assert.equal(
    closed.displayGrade,
    splitGrade({ tracker: TRACKER.closed, assignment: ASSIGNMENTS.find((a) => a.id === 'closed') }).score,
  );
});

test('a completed assignment offers its result, and a closed one offers practice beside it', () => {
  const result = center({ periodId: ALL_PERIODS_ID });
  const finished = result.rows.find((row) => row.assignmentId === 'finished');
  const closed = result.rows.find((row) => row.assignmentId === 'closed');
  const locked = result.rows.find((row) => row.assignmentId === 'locked');
  const started = result.rows.find((row) => row.assignmentId === 'in-progress');

  assert.equal(finished.canViewResults, true);
  assert.equal(closed.canViewResults, true);
  assert.equal(closed.canPractice, true);
  assert.equal(closed.canContinue, false, 'a closed assignment is practice, never "continue"');
  assert.equal(started.canContinue, true);
  assert.equal(started.continueLabel, 'Continue');
  assert.equal(locked.canContinue, false, 'locked work offers nothing to open');
  assert.equal(locked.canViewResults, false);
});

test('practising a closed assignment cannot move what the Assignments Center shows', () => {
  const before = center({ periodId: ALL_PERIODS_ID });
  const shown = before.rows.find((row) => row.assignmentId === 'closed').displayGrade;

  // Practice writes into a separate tracker. The Center reads the Grade Center,
  // which reads only the canonical one, so there is no parameter that could
  // carry practice work into this screen.
  const practiceTracker = { closed: { 0: correct, 1: correct } };
  const after = buildStudentAssignmentsCenter({
    ...buildContext(),
    gradingPeriodSettings: PERIOD_SETTINGS,
    periodId: ALL_PERIODS_ID,
    ...practiceTracker,
  });
  assert.equal(after.rows.find((row) => row.assignmentId === 'closed').displayGrade, shown);

  const source = executableSource(
    readFileSync(new URL('../../src/platform/student/studentAssignmentsCenterModel.js', import.meta.url), 'utf8'),
  );
  assert.doesNotMatch(source, /practiceTracker/);
  // And it must not contain grade arithmetic of its own.
  assert.doesNotMatch(source, /splitGrade\(|getQuestionCredit|normalizeQuestionWeight|bestPartialCredit/);
});

test('opening a completed assignment hands the result screen the Grade Center entry', () => {
  // Test 6 of the brief: the result a student opens from the Assignments Center
  // must be the SAME object the Grade Center would have shown them. Two lists
  // linking to two different renderings of one assignment is how a student ends
  // up with two different answers about the same grade.
  // One build, so this asserts the row carries the very object the Grade Center
  // produced rather than a look-alike rebuilt from the same inputs.
  const context = buildContext();
  const result = buildStudentAssignmentsCenter({
    ...context,
    gradingPeriodSettings: PERIOD_SETTINGS,
    periodId: ALL_PERIODS_ID,
    category: ASSIGNMENT_CATEGORY.COMPLETED,
  });
  const finished = result.visibleEntries.find((row) => row.assignmentId === 'finished');

  assert.ok(finished, 'a finished assignment is listed under Completed');
  assert.equal(finished.canViewResults, true);
  assert.equal(finished.gradeEntry, findGradeCenterEntry(context.gradeCenter, 'finished'));
  assert.equal(finished.gradeEntry.assignmentId, 'finished');
  assert.equal(finished.gradeEntry.displayGrade, finished.displayGrade);
});

test('the Assignments Center reads both models rather than rebuilding either', () => {
  const source = executableSource(
    readFileSync(new URL('../../src/platform/student/studentAssignmentsCenterModel.js', import.meta.url), 'utf8'),
  );
  assert.match(source, /dashboard\?\.allEntries/, 'lifecycle and progress come from the dashboard model');
  assert.match(source, /findGradeCenterEntry\(/, 'status and grades come from the Grade Center');
  assert.doesNotMatch(source, /buildStudentDashboardModel\(|buildStudentGradeCenter\(/, 'it consumes them, it does not re-run them');
});
