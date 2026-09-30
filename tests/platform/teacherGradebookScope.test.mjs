/*
 * THE GRADEBOOK OPENS ON SOMETHING USEFUL.
 *
 * The Gradebook follows the class bar. With "All classes" chosen it used to be
 * a disabled "Choose an assignment…" and nothing else; with a class chosen it
 * listed every assignment the class ever had. These pin the two starting
 * points (platform/teacher/gradebookScope.js): the class in session is offered
 * first, and the most relevant CURRENT assignment is opened by default.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { orderClassesForGradebook, suggestGradebookAssignmentId } from '../../src/platform/teacher/gradebookScope.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const schedule = {
  version: 2,
  periods: {},
  daySchedules: { A: { periods: {
    'Period 1': { enabled: true, start: '08:00', end: '09:00' },
    'Period 3': { enabled: true, start: '10:00', end: '11:30' },
    'Period 5': { enabled: true, start: '13:00', end: '14:00' },
  } }, B: { periods: {} } },
  weeklyDayTypes: { 0: null, 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A', 6: null },
  dayTypeOverrides: {},
  modifiedSchedules: {},
};
const WEDNESDAY_10_30 = new Date(2026, 8, 30, 10, 30);

test('the class in session comes first, then today\'s in bell order, then classes that do not meet today', () => {
  const ordered = orderClassesForGradebook({
    classes: [
      { classId: 'p5', name: 'Algebra I — Period 5', period: 'Period 5' },
      { classId: 'lab', name: 'Algebra II Lab — Period 3', period: 'Period 3' },
      { classId: 'p7', name: 'Geometry — Period 7', period: 'Period 7' },
      { classId: 'p1', name: 'Algebra I — Period 1', period: 'Period 1' },
      { classId: 'p3', name: 'Algebra II — Period 3', period: 'Period 3' },
      { classId: 'old', name: 'Last year', period: 'Period 1', status: 'archived' },
    ],
    schedule,
    nowValue: WEDNESDAY_10_30,
  });
  assert.deepEqual(ordered.map((entry) => entry.classId), ['p3', 'lab', 'p1', 'p5', 'p7']);
  assert.deepEqual(ordered.filter((entry) => entry.isNow).map((entry) => entry.classId), ['p3', 'lab'], 'two classes can share the period in session');
});

test('the default assignment is the current marking period\'s open one due soonest, else the most recently closed', () => {
  const settings = { periods: [{ id: 'mp1', label: 'MP1', order: 1 }, { id: 'mp2', label: 'MP2', order: 2 }], currentPeriodId: 'mp2' };
  const mp = (id) => settings.periods.find((entry) => entry.id === id);
  const at = (days) => new Date(WEDNESDAY_10_30.getTime() + days * 86_400_000).toISOString();
  const openSoon = { id: 'open-soon', dueAt: at(1), lateDueAt: at(3), gradingPeriod: mp('mp2') };
  const openLater = { id: 'open-later', dueAt: at(4), lateDueAt: at(6), gradingPeriod: mp('mp2') };
  const closedRecent = { id: 'closed-recent', dueAt: at(-4), lateDueAt: at(-1), gradingPeriod: mp('mp2') };
  const closedOld = { id: 'closed-old', dueAt: at(-10), lateDueAt: at(-8), gradingPeriod: mp('mp2') };
  const lastPeriodOpen = { id: 'mp1-still-open', dueAt: at(0.5), lateDueAt: at(2), gradingPeriod: mp('mp1') };
  assert.equal(suggestGradebookAssignmentId([closedOld, openLater, lastPeriodOpen, openSoon, closedRecent], settings, WEDNESDAY_10_30), 'open-soon');
  assert.equal(suggestGradebookAssignmentId([closedOld, closedRecent, lastPeriodOpen], settings, WEDNESDAY_10_30), 'closed-recent');
});

test('the Grades tab asks which class when none is chosen, instead of a disabled picker', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /import GradebookAssignmentBar, \{ GradebookClassChooser \} from '\.\/components\/teacher\/GradebookAssignmentBar\.jsx';/);
  const grades = executableSource(region(app, "{teacherTab === 'grades' && (", '<GradebookAssignmentBar', 'Grades tab head'));
  assert.match(grades, /classes\.length > 0 && !gradebookFilter\.classId && !gradebookFilter\.student && \(\s*<GradebookClassChooser classes=\{classes\} schedule=\{classSchedule\} nowValue=\{now\} onChoose=\{setActiveClass\} \/>/);
});
