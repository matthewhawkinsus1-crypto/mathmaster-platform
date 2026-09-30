/*
 * THE ASSIGNMENT LIST STARTS WITH WHAT IS BEING TAUGHT.
 *
 * The Assignments tab rendered every assignment ever made, oldest due date
 * first — today's lesson below a year of closed work. These tests pin the
 * grouping the tab now renders (platform/teacher/assignmentListGroups.js):
 * current work first, closed work folded by marking period, nothing hidden.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ASSIGNMENT_LIST_GROUP, groupAssignmentList } from '../../src/platform/teacher/assignmentListGroups.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const NOW = new Date(2026, 8, 30, 10, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays) => new Date(NOW.getTime() + offsetDays * DAY).toISOString();
const settings = {
  periods: [
    { id: 'mp1', label: '1st Marking Period', order: 1, archived: true },
    { id: 'mp2', label: '2nd Marking Period', order: 2, archived: false },
  ],
  currentPeriodId: 'mp2',
};
const make = (id, { release = -3, due, late, classes = ['c1'], period = 'mp2' }) => ({
  id,
  title: id,
  assignedClassIds: classes,
  releaseAt: release === null ? null : iso(release),
  dueAt: due === undefined ? null : iso(due),
  lateDueAt: late === undefined ? null : iso(late),
  gradingPeriod: settings.periods.find((entry) => entry.id === period),
});

// Arrives oldest-due-first, exactly as the live snapshot sorts it.
const assignments = [
  make('unit1-review', { release: -40, due: -33, late: -30, period: 'mp1' }),
  make('closed-last-week', { release: -12, due: -9, late: -6 }),
  make('closed-yesterday', { release: -5, due: -3, late: -1 }),
  make('late-window', { release: -4, due: -1, late: 3 }),
  make('due-tomorrow', { release: -1, due: 1, late: 4 }),
  make('due-today', { release: 0, due: 0.4, late: 3 }),
  make('opens-friday', { release: 2, due: 4, late: 6 }),
  make('library-copy', { release: null, classes: [] }),
];

test('current work leads, due soonest first, on-time before late-window', () => {
  const groups = groupAssignmentList({ assignments, nowValue: NOW, gradingPeriodSettings: settings });
  assert.equal(groups[0].kind, ASSIGNMENT_LIST_GROUP.CURRENT);
  assert.equal(groups[0].folded, false);
  assert.deepEqual(groups[0].assignments.map((entry) => entry.id), ['due-today', 'due-tomorrow', 'late-window']);
  assert.equal(groups[1].kind, ASSIGNMENT_LIST_GROUP.SCHEDULED);
  assert.deepEqual(groups[1].assignments.map((entry) => entry.id), ['opens-friday']);
});

test('closed work folds by marking period — this period first, most recent first — and library copies fold last', () => {
  const groups = groupAssignmentList({ assignments, nowValue: NOW, gradingPeriodSettings: settings });
  const closed = groups.filter((group) => group.kind === ASSIGNMENT_LIST_GROUP.CLOSED);
  assert.deepEqual(closed.map((group) => group.label), ['Closed this marking period', 'Closed · 1st Marking Period']);
  assert.ok(closed.every((group) => group.folded));
  assert.deepEqual(closed[0].assignments.map((entry) => entry.id), ['closed-yesterday', 'closed-last-week']);
  const last = groups[groups.length - 1];
  assert.equal(last.kind, ASSIGNMENT_LIST_GROUP.LIBRARY);
  assert.equal(last.folded, true);
  // Nothing is lost: every assignment is in exactly one group.
  assert.deepEqual(groups.flatMap((group) => group.assignments.map((entry) => entry.id)).sort(), assignments.map((entry) => entry.id).sort());
});

test('a search or Library filter shows one flat list in the same current-first order', () => {
  const [only, ...rest] = groupAssignmentList({ assignments, nowValue: NOW, gradingPeriodSettings: settings, flat: true });
  assert.equal(rest.length, 0);
  assert.equal(only.folded, false);
  assert.deepEqual(only.assignments.map((entry) => entry.id), [
    'due-today', 'due-tomorrow', 'late-window', 'opens-friday', 'closed-yesterday', 'closed-last-week', 'unit1-review', 'library-copy',
  ]);
});

test('empty groups are not rendered', () => {
  const groups = groupAssignmentList({ assignments: [assignments[4]], nowValue: NOW, gradingPeriodSettings: settings });
  assert.deepEqual(groups.map((group) => group.id), ['current']);
});

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

test('the Assignments tab renders the grouped list, imported, flat only while searching or filtered', () => {
  // App.jsx is .jsx: nothing imports it, so a call without an import passes
  // every check and throws at runtime (AGENTS.md). Assert both.
  assert.match(app, /import \{ groupAssignmentList \} from '\.\/platform\/teacher\/assignmentListGroups\.js';/);
  const tab = executableSource(region(app, "{teacherTab === 'assignments' && (", "{teacherTab === 'students' && (", 'Assignments tab'));
  assert.match(tab, /groupAssignmentList\(\{\s*assignments: visibleAssignments,/);
  assert.match(tab, /flat: assignmentListIsFiltered/);
  assert.match(app, /const assignmentListIsFiltered = Boolean\(assignmentSearch\.trim\(\) \|\| libraryNavigation\?\.folder \|\| libraryNavigation\?\.smartView\);/);
  assert.match(tab, /group\.assignments\.map\(renderAssignmentCard\)/);
  // The group holding the card being edited opens, so "Dates & classes" from
  // an assignment's hub never lands inside a folded group.
  assert.match(tab, /holdsOpenEditor \|\| \(assignmentGroupOpen\[group\.id\] \?\? false\)/);
  assert.doesNotMatch(tab, /visibleAssignments\.map\(\(assignment\) =>/, 'the flat oldest-first list is gone');
});

test('the hub can load one class\'s grades on the live screens, read-only', () => {
  const loader = executableSource(region(app, 'const loadClassGradeRecords = async (classId) => {', 'const openGradeExport =', 'class grade loader'));
  assert.match(loader, /studentsInClass\(\{ students: allStudents, classes, classId \}\)/);
  assert.match(loader, /getDoc\(doc\(db, 'grades', student\.id\)\)/);
  assert.doesNotMatch(loader, /updateDoc|setDoc|writeBatch|runTransaction/);
  assert.match(app, /onLoadClassGrades=\{loadClassGradeRecords\}/);
});
