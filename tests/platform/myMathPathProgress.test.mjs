/*
 * MY PROGRESS (student push D, item 6): this week against four weeks ago, past
 * weeks with the grades their gradebook received, and the "weeks hit" streak.
 *
 * The numbers come from the shared readers (masteryHistory.mjs,
 * weeklyPathHistory.mjs); these tests pin the words the student reads and the
 * wiring that hands each surface only what it can actually read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  describeGrowthForStudent,
  describeWeeklyHistoryForStudent,
  weekOfLabel,
} from '../../src/platform/mastery/progressPresentation.js';
import { studentLabelForTeks } from '../../src/platform/path/skillLabels.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-07T15:00:00Z');
const history = (weeks) => ({ weeks: Object.fromEntries(Object.entries(weeks).map(([key, skills]) => [key, { skills, updatedAt: 1 }])) });

test('no snapshot yet: an honest empty state, not a chart of zeroes', () => {
  const growth = describeGrowthForStudent({ history: null, now: NOW });
  assert.equal(growth.state, 'empty');
  assert.match(growth.message, /starts with your next answer/);
  assert.equal(growth.tiles, undefined);
});

test('only this week on record: today\'s numbers, and no invented comparison', () => {
  const growth = describeGrowthForStudent({ history: history({ '2026-10-05': { 'A.5A': [88, 4], 'A.2C': [60, 2] } }), now: NOW });
  assert.equal(growth.state, 'starting');
  assert.deepEqual(growth.tiles.map((tile) => [tile.key, tile.now, tile.changeLabel]), [
    ['mastered', '1', null], ['average', '74%', null], ['practised', '2', null],
  ]);
  assert.equal(growth.baselineLabel, undefined);
});

test('four weeks of history: the tiles, the like-for-like note and the movers, in student words', () => {
  const growth = describeGrowthForStudent({
    now: NOW,
    history: history({
      '2026-09-07': { 'A.5A': [58, 2], 'A.2C': [80, 3] },
      // A.7A was opened but has no score yet: not a skill practised.
      '2026-10-05': { 'A.5A': [88, 4], 'A.2C': [74, 3], 'A.6A': [40, 1], 'A.7A': [null, 0] },
    }),
  });
  assert.equal(growth.state, 'ready');
  assert.equal(growth.title, 'This week vs 4 weeks ago');
  assert.equal(growth.baselineLabel, '4 weeks ago');
  const [mastered, average, practised] = growth.tiles;
  assert.deepEqual([mastered.now, mastered.previous, mastered.changeLabel, mastered.direction], ['1', '0', '+1', 'up']);
  assert.deepEqual([average.now, average.previous, average.changeLabel], ['81%', '69%', '+12']);
  assert.equal(average.note, 'On the 2 skills you had started by then');
  assert.deepEqual([practised.now, practised.previous, practised.changeLabel], ['3', '2', '+1']);
  assert.deepEqual(growth.movers.map((entry) => [entry.label, entry.changeLabel, entry.direction]), [
    [studentLabelForTeks('A.5A'), '+30', 'up'], [studentLabelForTeks('A.2C'), '−6', 'down'],
  ]);
  assert.deepEqual(growth.newlyMastered.map((entry) => entry.code), ['A.5A']);
  assert.equal(growth.message, null);
});

test('a younger history says "since" its first week; an idle one says nothing was recorded', () => {
  const young = describeGrowthForStudent({ now: NOW, history: history({ '2026-09-21': { 'A.5A': [50, 2] }, '2026-10-05': { 'A.5A': [70, 3] } }) });
  assert.equal(young.title, 'This week vs the week of Sep 21');
  assert.equal(young.baselineLabel, 'Week of Sep 21');
  const idle = describeGrowthForStudent({ now: NOW, history: history({ '2026-08-03': { 'A.5A': [40, 1] }, '2026-08-24': { 'A.5A': [70, 3] } }) });
  assert.equal(idle.noRecentPractice, true);
  assert.match(idle.message, /No practice has been recorded in the last 4 weeks/);
  assert.equal(weekOfLabel('2026-10-05'), 'Week of Oct 5');
});

const week = (weekKey, fields) => ({
  weekKey, current: false, hasGoal: true, closed: true, hit: false, required: 4, completed: 0, completedOnTime: 0,
  lateCompletions: 0, grade: null, score: null, passing: null, ...fields,
});

test('past weeks: a grade only for a closed week, the deadline in the words, empty weeks before the first goal left out', () => {
  const view = describeWeeklyHistoryForStudent({
    weeks: [
      week('2026-10-05', { current: true, closed: false, completed: 1, completedOnTime: 1 }),
      week('2026-09-28', { hit: true, completed: 4, completedOnTime: 4, grade: 96.67, score: 97, passing: true }),
      week('2026-09-21', { hasGoal: false, required: 0 }),
      week('2026-09-14', { completed: 3, completedOnTime: 2, lateCompletions: 1, grade: 61.2, score: 61, passing: false }),
      week('2026-09-07', { hasGoal: false, required: 0 }),
      week('2026-08-31', { hasGoal: false, required: 0 }),
    ],
    streak: { weeks: 1, includesOpenWeek: false, atLeast: false, endedBy: '2026-09-21' },
    weeksHit: 1,
    weeksWithGoal: 3,
  });
  assert.deepEqual(view.rows.map((row) => [row.label, row.status.key, row.grade]), [
    ['This week', 'open', null],
    ['Week of Sep 28', 'hit', '97'],
    ['Week of Sep 21', 'noGoal', null],
    ['Week of Sep 14', 'missed', '61'],
  ]);
  assert.equal(view.rows[0].progress, '1 of 4 done so far');
  assert.equal(view.rows[0].current, true);
  assert.equal(view.rows[3].progress, '2 of 4 done by the deadline · 1 finished late');
  assert.equal(view.rows[2].progress, 'No weekly goal was set this week.');
  assert.deepEqual(view.streak, { count: 1, value: '1', label: 'week in a row', detail: 'Finish this week’s goal to make it one more.' });
  assert.equal(view.weeksHit, 1);
});

test('the streak in words: none yet, including this week, and "at least" past the window', () => {
  assert.match(describeWeeklyHistoryForStudent({ weeks: [], streak: { weeks: 0 } }).streak.detail, /to start a streak/);
  const open = describeWeeklyHistoryForStudent({ weeks: [], streak: { weeks: 3, includesOpenWeek: true } }).streak;
  assert.deepEqual([open.value, open.label], ['3', 'weeks in a row']);
  assert.match(open.detail, /Including this week/);
  assert.equal(describeWeeklyHistoryForStudent({ weeks: [], streak: { weeks: 12, atLeast: true } }).streak.value, '12+');
  assert.equal(describeWeeklyHistoryForStudent(null).rows.length, 0);
});

// ------------------------------------------------------------------ wiring

const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));

test('My Progress is its own tab in My Math Path, and App imports what it renders', () => {
  const tabs = region(app, 'const TABS = [', '];', 'tabs');
  assert.match(tabs, /\['progress', 'My Progress'\]/);
  assert.match(app, /import MyMathPathProgress from '\.\/MyMathPathProgress\.jsx';/);
  const render = region(app, "{activeTab === 'progress' && (", '/>', 'progress render');
  assert.match(render, /<MyMathPathProgress/);
  assert.match(render, /loadMasteryHistory=\{loadMasteryHistory\}/);
  assert.match(render, /loadWeeklyHistory=\{loadWeeklyHistory\}/);
  assert.match(render, /onOpenPath=\{readOnly \? null : \(\) => setActiveTab\('path'\)\}/);
});

test('each surface gets only what it can read: student, read-only teacher, simulator', () => {
  const mastery = region(app, 'const loadMasteryHistory = useMemo(() => {', '}, [sessionProvider, readOnly, studentId]);', 'mastery loader');
  assert.match(mastery, /if \(sessionProvider\) return null;/, 'the simulator never reads a real student\'s history');
  assert.match(mastery, /if \(!readOnly\) return \(\) => fetchStudentMasteryHistory\(studentId\);/);
  // Read-only: a refused read of a not-yet-written history is "none yet", and
  // only that — any other failure still surfaces.
  assert.match(mastery, /if \(caught\?\.code === 'permission-denied'\) return null;\s*throw caught;/);
  assert.match(app, /import \{ fetchStudentMasteryHistory \} from '\.\.\/\.\.\/platform\/mastery\/masteryHistoryStore\.js';/);

  const weekly = region(app, 'const loadWeeklyHistory = useMemo(() => {', '}, [sessionProvider, readOnly, assignedWeeklyGoal]);', 'weekly loader');
  // A teacher cannot call a student-only callable; the screen says so instead.
  assert.match(weekly, /return readOnly \? null : fetchMyWeeklyPathHistory;/);
  // The simulator grades its synthetic week with the callable's own builder.
  assert.match(weekly, /buildWeeklyPathHistory\(\{[\s\S]*sessions: sessionProvider\.listPathSessions\?\.\(\) \|\| \[\]/);
  assert.match(app, /import \{[^}]*\bfetchMyWeeklyPathHistory\b[^}]*\} from '\.\.\/\.\.\/platform\/path\/pathStore\.js';/);
  assert.match(app, /import \{ buildWeeklyPathHistory \} from '\.\.\/\.\.\/\.\.\/functions\/shared\/weeklyPathHistory\.mjs';/);
});

test('the history reader is a single read of the student\'s own document, never a write', () => {
  const store = executableSource(read('src/platform/mastery/masteryHistoryStore.js'));
  assert.match(store, /getDoc\(doc\(db, MASTERY_HISTORY_COLLECTION, id\)\)/);
  assert.doesNotMatch(store, /setDoc|updateDoc|deleteDoc|addDoc|writeBatch/);
});

test('the screen renders the shared descriptions and keeps the Path vocabulary', () => {
  const screen = executableSource(read('src/components/student/MyMathPathProgress.jsx'));
  assert.match(screen, /describeGrowthForStudent\(\{ history: state\.data, now \}\)/);
  assert.match(screen, /describeWeeklyHistoryForStudent\(state\.data\)/);
  // The grade cell shows only the row's grade, which exists only for a closed week.
  assert.match(screen, /\{row\.grade !== null && \(/);
  assert.match(screen, /Skills that moved most/);
  assert.match(screen, /onClick=\{onRetry\}/);
  assert.doesNotMatch(screen, /Path Pass|Mastery challenge/);
  assert.doesNotMatch(read('src/platform/mastery/progressPresentation.js'), /Path Pass|Mastery challenge/);
});
