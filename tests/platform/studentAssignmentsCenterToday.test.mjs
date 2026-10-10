import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ALL_PERIODS_ID,
  ASSIGNMENT_CATEGORY,
  ASSIGNMENT_CATEGORY_HINT,
  ASSIGNMENT_CATEGORY_LABEL,
  RECOVERY_LABEL,
  TRY_AGAIN_LABEL,
  buildStudentAssignmentsCenter,
  resolveActions,
  sortRowsForCategory,
} from '../../src/platform/student/studentAssignmentsCenterModel.js';
import { buildScreens } from './fixtures/studentTodayScreens.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * THE ASSIGNMENTS CENTER READS THE ONE "TODAY" RULE.
 *
 * Every button on a row comes from the dashboard entry's actionable / finished
 * / excused / waitText / nextQuestionIndex / action — never re-derived from the
 * lifecycle. Built from the real dashboard and Grade Center models
 * (fixtures/studentTodayScreens.mjs) so the rows are ones the product makes.
 */

const screens = buildScreens();
const center = (options = {}) => buildStudentAssignmentsCenter({
  dashboard: screens.dashboard, gradeCenter: screens.gradeCenter, periodId: ALL_PERIODS_ID, ...options,
});
const result = center();
const rowOf = (id) => result.rows.find((row) => row.assignmentId === id);
const idsIn = (categoryId) => result.categories.find((group) => group.id === categoryId).entries.map((row) => row.assignmentId);

const centerSource = readFileSync(new URL('../../src/components/student/StudentAssignmentsCenter.jsx', import.meta.url), 'utf8');
const rowActions = region(executableSource(centerSource), 'data-row-actions=', '</article>', 'Assignments Center row actions');

test('Start/Continue only when the Today rule says the button lands on work open now', () => {
  const actionable = rowOf('actionable');
  assert.equal(actionable.canContinue, true);
  assert.equal(actionable.continueLabel, 'Continue');
  // Classwork Q1 is done, so Continue lands on question 1 — not 0.
  assert.equal(actionable.continueQuestionIndex, 1);
  assert.equal(actionable.continueQuestionIndex, screens.todayEntryOf('actionable').nextQuestionIndex);

  const notStarted = rowOf('due-today');
  assert.equal(notStarted.canContinue, true);
  assert.equal(notStarted.continueLabel, 'Start');
  assert.equal(notStarted.continueQuestionIndex, 0);

  // Both waiting lessons are open by date and NOT disabled-by-lifecycle — the
  // old rule offered Start on them, and the student landed on "Nothing open".
  for (const id of ['locked-practice', 'waiting-dol']) {
    assert.equal(screens.todayEntryOf(id).lifecycle.isOpen, true, `${id} is inside its dates`);
    assert.equal(rowOf(id).canContinue, false, `${id} has nothing open now, so no Start`);
  }
});

test('waiting rows show what they are waiting for instead of a button', () => {
  assert.match(rowOf('locked-practice').waitText, /^Practice opens when your teacher starts it in class$/);
  assert.match(rowOf('waiting-dol').waitText, /^DOL opens at /);
  assert.equal(rowOf('actionable').waitText, null, 'open work has no wait text');
  assert.equal(rowOf('closed').waitText, null, 'closed work is not "waiting"');
  // The component renders the wait text in the row's action area.
  assert.match(rowActions, /row\.waitText &&/);
  assert.match(rowActions, /\{row\.waitText\}/);
});

test('Continue passes the question index the Today rule chose', () => {
  assert.match(
    rowActions,
    /onContinue\?\.\(row\.assignmentId, row\.continueQuestionIndex/,
    'onContinue(assignmentId, questionIndex) — App lands on that question',
  );
});

test('a Recovery opens the result page as "Open Recovery", never Start', () => {
  const recovery = rowOf('recovery');
  assert.equal(screens.todayEntryOf('recovery').action, 'recovery');
  assert.equal(recovery.canRecover, true);
  assert.equal(recovery.recoveryLabel, RECOVERY_LABEL);
  assert.equal(RECOVERY_LABEL, 'Open Recovery');
  assert.equal(recovery.canContinue, false);
  assert.equal(recovery.canViewResults, false, 'the Recovery button already opens the result');
  const recoverButton = region(rowActions, '{row.canRecover && (', '</button>', 'Recovery button');
  assert.match(recoverButton, /onOpenResult\?\.\(row\.assignmentId\)/);
});

test('excused rows say Excused and offer their result only', () => {
  const excused = rowOf('excused');
  assert.equal(excused.excused, true);
  assert.equal(excused.statusLabel, 'Excused');
  assert.equal(excused.canContinue, false);
  assert.equal(excused.canPractice, false);
  assert.equal(excused.canRecover, false);
  assert.equal(excused.waitText, null);
  assert.equal(excused.canViewResults, true);
  // Excused even without a Grade Center entry.
  const bare = resolveActions({ entry: { excused: true, actionable: true, lifecycle: { isPracticeOnly: true } } });
  assert.equal(bare.canContinue, false);
  assert.equal(bare.canPractice, false);
  assert.equal(bare.canViewResults, true);
});

test('View Results is not offered on not-started open work with nothing recorded', () => {
  assert.equal(rowOf('due-today').canViewResults, false);
  assert.equal(rowOf('upcoming-later').canViewResults, false);
  assert.equal(rowOf('past-due').canViewResults, false);
  // Recorded work, finished work and closed work all have a result.
  assert.equal(rowOf('actionable').canViewResults, true);
  assert.equal(rowOf('finished').canViewResults, true);
  assert.equal(rowOf('closed').canViewResults, true);
  // Closed with nothing attempted still has its record.
  assert.equal(resolveActions({ entry: { lifecycle: { isPracticeOnly: true }, finished: true } }).canViewResults, true);
});

test('closed work is "Try it again — no credit", never "Practice"', () => {
  const closed = rowOf('closed');
  assert.equal(closed.canContinue, false);
  assert.equal(closed.canPractice, true);
  assert.equal(closed.practiceLabel, TRY_AGAIN_LABEL);
  assert.equal(TRY_AGAIN_LABEL, 'Try it again — no credit');
  assert.ok(idsIn(ASSIGNMENT_CATEGORY.PRACTICE).includes('closed'));

  const retryButton = region(rowActions, '{row.canPractice && (', '</button>', 'retry button');
  assert.match(retryButton, /\{row\.practiceLabel\}/);
  assert.doesNotMatch(rowActions, />\s*Practice\s*</, 'no bare "Practice" button label on a row');
});

test('the closed tab keeps its id and says "Closed — try again"', () => {
  assert.equal(ASSIGNMENT_CATEGORY.PRACTICE, 'practice', 'the id is stable');
  assert.equal(ASSIGNMENT_CATEGORY_LABEL[ASSIGNMENT_CATEGORY.PRACTICE], 'Closed — try again');
  assert.equal(
    ASSIGNMENT_CATEGORY_HINT[ASSIGNMENT_CATEGORY.PRACTICE],
    'Past the final deadline. You can try these again; they no longer change your grade.',
  );
  for (const text of [...Object.values(ASSIGNMENT_CATEGORY_LABEL), ...Object.values(ASSIGNMENT_CATEGORY_HINT)]) {
    assert.doesNotMatch(text, /\bpractis|\bPractice\b/, `"${text}" must not use Practice for closed work`);
  }
  const tab = result.categories.find((group) => group.id === ASSIGNMENT_CATEGORY.PRACTICE);
  assert.equal(tab.label, 'Closed — try again');
});

test('Upcoming is sorted soonest due first', () => {
  // The fixture lists them next week, in two days, in three days.
  assert.deepEqual(idsIn(ASSIGNMENT_CATEGORY.UPCOMING), ['locked-practice', 'waiting-dol', 'upcoming-later']);
});

test('Active puts past-due work first, then soonest due', () => {
  assert.deepEqual(idsIn(ASSIGNMENT_CATEGORY.ACTIVE), ['past-due', 'actionable', 'due-today', 'recovery']);
  // Late work leads even when its date sorts later — a row is "late" by this
  // student's lifecycle, not by comparing dates.
  const rows = [
    { assignmentId: 'today', dueAt: '2026-10-26T20:00:00Z', lifecycle: { isLate: false } },
    { assignmentId: 'late', dueAt: '2026-10-27T20:00:00Z', lifecycle: { isLate: true } },
    { assignmentId: 'soon', dueAt: '2026-10-26T18:00:00Z', lifecycle: { isLate: false } },
  ];
  assert.deepEqual(sortRowsForCategory(ASSIGNMENT_CATEGORY.ACTIVE, rows).map((row) => row.assignmentId), ['late', 'soon', 'today']);
});

test('Completed and Closed stay most recent first', () => {
  // excused was due a day ago, finished two days ago.
  assert.deepEqual(idsIn(ASSIGNMENT_CATEGORY.COMPLETED), ['excused', 'finished']);
  const rows = [
    { assignmentId: 'old', dueAt: '2026-09-01T12:00:00Z' },
    { assignmentId: 'none', dueAt: null },
    { assignmentId: 'new', dueAt: '2026-10-01T12:00:00Z' },
  ];
  assert.deepEqual(sortRowsForCategory(ASSIGNMENT_CATEGORY.COMPLETED, rows).map((row) => row.assignmentId), ['new', 'old', 'none']);
  assert.deepEqual(sortRowsForCategory(ASSIGNMENT_CATEGORY.PRACTICE, rows).map((row) => row.assignmentId), ['new', 'old', 'none']);
  assert.deepEqual(sortRowsForCategory(ASSIGNMENT_CATEGORY.UPCOMING, rows).map((row) => row.assignmentId), ['old', 'new', 'none']);
});

test('a Test Cycle keeps its own stage action and carries no question index', () => {
  const row = resolveActions({ entry: { actionable: true, nextQuestionIndex: null, lifecycle: {} } });
  assert.equal(row.canContinue, true);
  assert.equal(row.continueQuestionIndex, null);
});
